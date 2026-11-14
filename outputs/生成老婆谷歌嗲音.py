#!/usr/bin/env python3
"""
使用 Google Gemini 3.8 Flash TTS 复刻老婆原声并批量生成全套 19 段撒娇气音主持 MP3。
零第三方依赖（仅使用 Python 标准库 + 本机 ffmpeg）。
"""

import argparse
import base64
import json
import getpass
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

API_BASE = "https://generativelanguage.googleapis.com/v1beta"
MANDARIN_CONSENT_TEXT = "我是此声音的拥有者并授权谷歌使用此声音创建语音合成模型"

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_CONFIG = SCRIPT_DIR / "谷歌嗲音台词配置.json"
DEFAULT_REF_WAV = SCRIPT_DIR / "老婆原声参考样本_26秒.wav"
SAVED_VOICE_ID_FILE = SCRIPT_DIR / ".google_voice_id.txt"
USER_CONFIG_DIR = Path.home() / ".config" / "gemini"
USER_API_KEY_FILE = USER_CONFIG_DIR / "api_key"
USER_VOICE_ID_FILE = USER_CONFIG_DIR / "wife_voice_id"
SAMPLE_OUT_DIR = SCRIPT_DIR / "谷歌嗲音试听"
FULL_OUT_DIR = SCRIPT_DIR / "谷歌嗲音全套成品"
BACKUP_DIR = SCRIPT_DIR / "旧版语音备份"


def check_ffmpeg() -> None:
    if not shutil.which("ffmpeg"):
        sys.exit("错误：未找到 ffmpeg，请先在终端安装 ffmpeg。")


def save_voice_id_everywhere(voice_id: str) -> None:
    SAVED_VOICE_ID_FILE.write_text(voice_id + "\n", encoding="utf-8")
    try:
        USER_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        os.chmod(USER_CONFIG_DIR, 0o700)
        USER_VOICE_ID_FILE.write_text(voice_id + "\n", encoding="utf-8")
    except OSError:
        pass


def prompt_and_save_api_key_gui() -> str:
    applescript = (
        'with timeout of 600 seconds\n'
        '  beep 1\n'
        '  activate\n'
        '  set theResult to display dialog "请粘贴你的 Google API Key：\\n\\n点「保存并开跑」后将存入本机 ~/.config/gemini/api_key，并设置仅当前账号可读写的权限。" '
        'default answer "" with hidden answer buttons {"取消", "保存并开跑"} default button "保存并开跑" with title "保存 Google API Key"\n'
        '  return text returned of theResult\n'
        'end timeout'
    )
    res = subprocess.run(["osascript", "-e", applescript], capture_output=True, text=True)
    key = "".join(res.stdout.split()) if res.returncode == 0 else ""
    if not key:
        try:
            raw = getpass.getpass("\n请粘贴 Google API Key 后按回车（输入不显示）：")
            key = "".join(raw.split())
        except EOFError:
            key = ""
    if not key:
        sys.exit("未输入任何内容，请重新运行并粘贴 API Key。")
    USER_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(USER_CONFIG_DIR, 0o700)
    USER_API_KEY_FILE.write_text(key + "\n", encoding="utf-8")
    os.chmod(USER_API_KEY_FILE, 0o600)
    print("API Key 已存入本机，文件权限设为仅当前账号可读写。")
    return key


def resolve_api_key(cli_key: str, save_gui: bool = False) -> str:
    if save_gui and not USER_API_KEY_FILE.exists():
        return prompt_and_save_api_key_gui()
    if cli_key and cli_key.strip():
        return cli_key.strip()
    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key
    if USER_API_KEY_FILE.exists():
        saved_key = USER_API_KEY_FILE.read_text(encoding="utf-8").strip()
        if saved_key:
            return saved_key
    if save_gui:
        return prompt_and_save_api_key_gui()
    sys.exit(
        "错误：未找到 Google API Key。\n"
        f"请先将 API Key 保存到本机私密文件 {USER_API_KEY_FILE}，或加 --save-key-gui 弹窗录入。"
    )


def convert_to_24k_mono_wav(src_path: Path, dst_path: Path) -> None:
    if not src_path.exists():
        sys.exit(f"错误：找不到音频文件 {src_path}")
    cmd = [
        "ffmpeg", "-y", "-i", str(src_path),
        "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le",
        str(dst_path), "-loglevel", "error"
    ]
    subprocess.run(cmd, check=True)


def ensure_wav_bytes(raw_bytes: bytes, sample_rate: int = 24000) -> bytes:
    if raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WAVE":
        return raw_bytes
    data_len = len(raw_bytes)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + data_len, b"WAVE", b"fmt ", 16,
        1, 1, sample_rate, sample_rate * 2, 2, 16,
        b"data", data_len
    )
    return header + raw_bytes


def post_google_json(endpoint: str, api_key: str, payload: dict, timeout: int = 90) -> dict:
    url = f"{API_BASE}/{endpoint.lstrip('/')}"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "x-goog-api-key": api_key,
            "Content-Type": "application/json; charset=utf-8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        sys.exit(
            f"\nGoogle 接口返回错误 (HTTP {err.code})：\n{detail}\n\n"
            "常见原因排查：\n"
            "1. 若提示 PERMISSION_DENIED / billing：请确认 Google AI Studio 关联的 GCP 项目已开启 Tier 1 付费结算。\n"
            "2. 若提示 consent / speaker verification：请确认授权录音由同一人清晰念完指定句子：\n"
            f"   「{MANDARIN_CONSENT_TEXT}」\n"
        )
    except urllib.error.URLError as err:
        sys.exit(f"\n网络连接 Google 接口失败：{err}\n请检查本机代理或网络是否可访问 generativelanguage.googleapis.com。")


def extract_voice_id(resp: dict) -> str:
    for candidate in (
        resp.get("id"),
        resp.get("key"),
        (resp.get("voice") or {}).get("id"),
        (resp.get("replicated_voice") or {}).get("id"),
        (resp.get("replicatedVoice") or {}).get("id"),
        resp.get("name", "").split("/")[-1] if isinstance(resp.get("name"), str) else "",
    ):
        if isinstance(candidate, str) and (candidate.startswith("voice_") or candidate.startswith("voicekey_")):
            return candidate
    sys.exit(f"未能从 Google 返回结果中提取到 voice_id，原始返回：\n{json.dumps(resp, ensure_ascii=False, indent=2)}")


def extract_audio_b64(resp: dict) -> str:
    output_audio = resp.get("output_audio") or resp.get("outputAudio")
    if isinstance(output_audio, dict) and output_audio.get("data"):
        return output_audio["data"]
    for step in reversed(resp.get("steps") or []):
        for part in reversed(step.get("content") or []):
            if part.get("type") == "audio" and part.get("data"):
                return part["data"]
            inline = part.get("inlineData") or part.get("inline_data")
            if isinstance(inline, dict) and inline.get("data"):
                return inline["data"]
    sys.exit(f"Google 未返回音频数据（可能台词触发安全过滤），原始返回：\n{json.dumps(resp, ensure_ascii=False, indent=2)}")


def replicate_wife_voice(api_key: str, ref_audio: Path, consent_audio: Path, model: str) -> str:
    print(f"正在将参考音频与授权录音标准化为 24kHz 单声道无损 WAV...")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        ref_wav = tmp_dir / "ref_24k.wav"
        consent_wav = tmp_dir / "consent_24k.wav"
        convert_to_24k_mono_wav(ref_audio, ref_wav)
        convert_to_24k_mono_wav(consent_audio, consent_wav)

        ref_b64 = base64.b64encode(ref_wav.read_bytes()).decode("ascii")
        consent_b64 = base64.b64encode(consent_wav.read_bytes()).decode("ascii")

    print("正在上传至 Google Gemini 3.8 TTS 创建专属克隆音色...")
    payload = {
        "store": True,
        "voice": {
            "model": model,
            "type": "replicated",
            "display_name": "Werewolf Host Coquettish Wife Voice",
            "replicated": {
                "source_audio": {"mime_type": "audio/wav", "data": ref_b64},
                "consent_audio": {"mime_type": "audio/wav", "data": consent_b64},
            },
        },
    }
    resp = post_google_json("voices", api_key, payload, timeout=120)
    voice_id = extract_voice_id(resp)
    save_voice_id_everywhere(voice_id)
    print(f"克隆成功！已保存专属声音编号：{voice_id}")
    return voice_id


def master_wav_to_hd_mp3(wav_bytes: bytes, out_mp3: Path) -> float:
    with tempfile.TemporaryDirectory() as tmp:
        raw_wav = Path(tmp) / "raw.wav"
        raw_wav.write_bytes(ensure_wav_bytes(wav_bytes, 24000))
        # 转换输出采样率不会恢复源音频中已缺失的频段。
        af_chain = (
            "silenceremove=start_periods=1:start_silence=0.06:start_threshold=-52dB,"
            "areverse,silenceremove=start_periods=1:start_silence=0.12:start_threshold=-52dB,areverse,"
            "loudnorm=I=-16:TP=-1.5:LRA=11"
        )
        cmd = [
            "ffmpeg", "-y", "-i", str(raw_wav),
            "-af", af_chain,
            "-ac", "1", "-ar", "44100", "-b:a", "160k",
            str(out_mp3), "-loglevel", "error"
        ]
        subprocess.run(cmd, check=True)

    info = subprocess.check_output(["afinfo", str(out_mp3)], text=True)
    m = re.search(r"estimated duration:\s*([0-9.]+)", info)
    return float(m.group(1)) if m else 0.0


def synthesize_batch(
    api_key: str, voice_id: str, config: dict, out_dir: Path, sample_only: bool, only_keys: set[str] | None = None
) -> list[Path]:
    model = config.get("model", "gemini-3.8-flash-tts")
    preset_key = config.get("active_style_preset", "coquettish_whisper")
    default_style = (config.get("style_presets") or {}).get(preset_key, "")
    all_lines = config.get("lines") or []
    sample_keys = {"nightOpen", "wolfAction", "witchAction"}
    if only_keys:
        items = [x for x in all_lines if x["file"] in only_keys]
        if not items:
            sys.exit(f"错误：在配置表中未找到指定的文件名：{sorted(only_keys)}")
    else:
        items = [x for x in all_lines if (x["file"] in sample_keys if sample_only else True)]

    out_dir.mkdir(parents=True, exist_ok=True)
    generated_files: list[Path] = []

    for idx, item in enumerate(items, 1):
        fname = item["file"]
        text = item["text"]
        style = item.get("style") or default_style
        print(f"[{idx}/{len(items)}] 生成 {fname}.mp3 （{item.get('desc', '')}）...")
        payload = {
            "model": model,
            "input": [{
                "type": "user_input",
                "content": [{
                    "type": "text",
                    "text": text,
                    "annotations": [{"type": "speech_metadata", "style": style}],
                }],
            }],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": voice_id}]},
        }
        resp = post_google_json("interactions", api_key, payload, timeout=90)
        wav_bytes = base64.b64decode(extract_audio_b64(resp))
        out_mp3 = out_dir / f"{fname}.mp3"
        dur = master_wav_to_hd_mp3(wav_bytes, out_mp3)
        warn = " [注意：超过8.5秒，建议精简几个字以免撞上9秒超时]" if dur > 8.5 else ""
        print(f"    -> 完成：{out_mp3.name} ({dur:.2f} 秒){warn}")
        generated_files.append(out_mp3)
        if idx < len(items):
            time.sleep(0.35)

    return generated_files


def install_into_game(generated_files: list[Path]) -> None:
    god_dir = PROJECT_ROOT / "audio" / "god"
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for old_mp3 in god_dir.glob("*.mp3"):
        backup_target = BACKUP_DIR / old_mp3.name
        if not backup_target.exists():
            shutil.copy2(old_mp3, backup_target)

    for src_mp3 in generated_files:
        shutil.copy2(src_mp3, god_dir / src_mp3.name)

    # 开启 10 人局双女巫真人 MP3 开关并同步更新 sw.js 离线缓存清单与版本号
    index_path = PROJECT_ROOT / "index.html"
    index_text = index_path.read_text(encoding="utf-8")
    if (god_dir / "witchAction_1.mp3").exists() and (god_dir / "witchAction_2.mp3").exists():
        index_text = index_text.replace(
            "const HAS_RECORDED_WITCH_SLOTS = false;",
            "const HAS_RECORDED_WITCH_SLOTS = true;"
        )
        index_path.write_text(index_text, encoding="utf-8")

    sw_path = PROJECT_ROOT / "sw.js"
    sw_text = sw_path.read_text(encoding="utf-8")
    for extra in ("./audio/god/witchAction_1.mp3", "./audio/god/witchAction_2.mp3"):
        if (god_dir / Path(extra).name).exists() and f"'{extra}'" not in sw_text:
            sw_text = sw_text.replace(
                "  './audio/god/witchAction.mp3',\n",
                f"  './audio/god/witchAction.mp3',\n  '{extra}',\n"
            )
    m = re.search(r"const APP_VERSION = '([^']+)';", sw_text)
    if m:
        cur_ver = m.group(1)
        parts = cur_ver.rsplit("-", 1)
        next_ver = f"{parts[0]}-{int(parts[1]) + 1}" if len(parts) == 2 and parts[1].isdigit() else f"{cur_ver}-voice"
        sw_text = sw_text.replace(f"const APP_VERSION = '{cur_ver}';", f"const APP_VERSION = '{next_ver}';", 1)
        print(f"已自动更新 sw.js 离线缓存版本号：{cur_ver} -> {next_ver}")
    sw_path.write_text(sw_text, encoding="utf-8")
    print(f"已将 {len(generated_files)} 段新语音安装至 audio/god/（原语音已备份在 {BACKUP_DIR}）。")


def get_google_json(endpoint: str, api_key: str, timeout: int = 30) -> dict:
    url = f"{API_BASE}/{endpoint.lstrip('/')}"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"x-goog-api-key": api_key},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        sys.exit(f"\n查询 Google 声音列表失败 (HTTP {err.code})：\n{detail}\n请检查 API Key 是否填写正确。")
    except urllib.error.URLError as err:
        sys.exit(f"\n网络连接 Google 接口失败：{err}\n请检查本机网络或代理设置（确保终端能访问 Google）。")


def auto_discover_replicated_voice(api_key: str) -> str:
    print("正在自动查找你在 Google AI Studio 网页端录好的专属声音...")
    resp = get_google_json("voices?type=replicated", api_key)
    voices = resp.get("voices") or []
    replicated = [
        v for v in voices
        if isinstance(v, dict) and str(v.get("type", "")).lower() in ("replicated", "voice_type_replicated", "")
        and str(v.get("id") or v.get("name", "").split("/")[-1]).startswith("voice_")
    ]
    if not replicated:
        sys.exit(
            "\n未在当前 API Key 所属项目下找到已克隆的声音。\n"
            "请核对以下两点：\n"
            "1. 在 Google AI Studio 左下角点 Get API key 时，请选择与你刚才录音【同一个 Project（项目）】的 Key；\n"
            "2. 或者在录音试听页面右上角点 Get code，复制里面的 voice_xxx 编号，在命令末尾加上 --voice \"voice_xxx\"。"
        )
    print(f"共找到 {len(replicated)} 个已克隆的专属声音（按最新排序）：")
    for i, v in enumerate(replicated, 1):
        vid = v.get("id") or str(v.get("name", "")).split("/")[-1]
        vname = v.get("display_name") or v.get("displayName") or "未命名克隆音色"
        mark = " <-- 默认选用最新" if i == 1 else ""
        print(f"  {i}. {vname}  ({vid}){mark}")
    chosen_id = replicated[0].get("id") or str(replicated[0].get("name", "")).split("/")[-1]
    save_voice_id_everywhere(chosen_id)
    return chosen_id


def resolve_voice_id(args: argparse.Namespace, api_key: str, model: str) -> str:
    if args.voice:
        save_voice_id_everywhere(args.voice.strip())
        return args.voice.strip()
    if args.consent:
        return replicate_wife_voice(api_key, Path(args.ref), Path(args.consent), model)
    for fpath in (SAVED_VOICE_ID_FILE, USER_VOICE_ID_FILE):
        if fpath.exists():
            saved = fpath.read_text(encoding="utf-8").strip()
            if saved:
                save_voice_id_everywhere(saved)
                print(f"已读取本机记住的老婆专属声音编号：{saved}")
                return saved
    return auto_discover_replicated_voice(api_key)


def main() -> None:
    parser = argparse.ArgumentParser(description="Google Gemini 3.8 TTS 老婆嗲音克隆与主持语音批量生成器")
    parser.add_argument("--api-key", default=os.environ.get("GEMINI_API_KEY", ""), help="Google AI Studio API Key（也可设环境变量 GEMINI_API_KEY）")
    parser.add_argument("--ref", default=str(DEFAULT_REF_WAV), help="老婆原声参考音频路径（默认使用已切好的 26 秒样本）")
    parser.add_argument("--consent", default="", help="老婆念中文授权句的 5 秒录音路径（支持 m4a/mp3/wav 自动转换）")
    parser.add_argument("--voice", default="", help="直接指定已有的 voice_xxx 编号，或传 Kore 测试内置女声")
    parser.add_argument("--preset", choices=["sweet_gentle", "coquettish_whisper", "sultry_tease"], default="", help="覆盖默认嗲度档位")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="台词 JSON 配置文件路径")
    parser.add_argument("--save-key-gui", action="store_true", help="若本机尚未存钥匙，弹出苹果输入框粘贴保存")
    parser.add_argument("--sample", action="store_true", help="仅生成 3 句代表台词到试听文件夹")
    parser.add_argument("--all", action="store_true", help="生成全部 19 段主持语音")
    parser.add_argument("--only", default="", help="仅重新生成指定的几句（逗号分隔，如 wolfAction,witchAction）")
    parser.add_argument("--install", action="store_true", help="生成后自动备份旧版并替换进游戏 audio/god/")
    args = parser.parse_args()

    check_ffmpeg()
    api_key = resolve_api_key(args.api_key, save_gui=args.save_key_gui)

    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    if args.preset:
        config["active_style_preset"] = args.preset

    voice_id = resolve_voice_id(args, api_key, config.get("model", "gemini-3.8-flash-tts"))
    only_keys = {k.strip().removesuffix(".mp3") for k in args.only.split(",") if k.strip()} if args.only else None

    if not args.sample and not args.all and not only_keys:
        print("未指定 --sample / --all / --only，默认先生成 3 句试听样片（加 --all --install 可生成全套并装入游戏）。")
        args.sample = True

    is_sample_mode = bool(args.sample and not args.all and not only_keys)
    target_dir = SAMPLE_OUT_DIR if is_sample_mode else FULL_OUT_DIR
    files = synthesize_batch(api_key, voice_id, config, target_dir, sample_only=is_sample_mode, only_keys=only_keys)
    print(f"\n生成完毕！音频保存在：{target_dir}")

    if args.install:
        if is_sample_mode:
            print("提示：当前仅生成了 3 句试听，未覆盖游戏目录。满意后请用 --all --install 一键替换全部 19 段。")
        else:
            install_into_game(files)


if __name__ == "__main__":
    main()
