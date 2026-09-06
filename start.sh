#!/bin/bash
# Assignment_Dashboard - macOS/Linux 启动脚本
# 用法: ./start.sh [--check] [--background] [server.py 参数]

set -e
cd "$(dirname "$0")"

PORT=18765
PYTHON_CMD=""
BACKGROUND=0
BACKGROUND_WORKER=0
CHECK_ONLY=0
SERVER_ARGS=()
STOP_REQUESTED=0

handle_stop() {
    STOP_REQUESTED=1
}
trap handle_stop INT TERM

cleanup_worker_pid() {
    if [ "$BACKGROUND_WORKER" -eq 1 ] && [ -f data/start-worker.pid ]; then
        RECORDED_PID=$(sed -n '1p' data/start-worker.pid 2>/dev/null || true)
        if [ "$RECORDED_PID" = "$$" ]; then
            rm -f data/start-worker.pid
        fi
    fi
}
trap cleanup_worker_pid EXIT

for ARG in "$@"; do
    case "$ARG" in
        --check) CHECK_ONLY=1 ;;
        --background) BACKGROUND=1 ;;
        --background-worker) BACKGROUND_WORKER=1 ;;
        *) SERVER_ARGS+=("$ARG") ;;
    esac
done

# 查找 Python
if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    # 确认是 Python 3
    PY_VER=$(python --version 2>&1 | grep -oE '[0-9]+' | head -1)
    if [ "$PY_VER" = "3" ]; then
        PYTHON_CMD="python"
    fi
fi

if [ -z "$PYTHON_CMD" ]; then
    echo "[ERROR] 未找到 Python 3"
    echo "请安装 Python 3.10 或更高版本"
    echo "  macOS:  brew install python3"
    echo "  Linux:  sudo apt install python3"
    exit 1
fi

if ! "$PYTHON_CMD" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'; then
    echo "[ERROR] Python 版本过低: $("$PYTHON_CMD" --version 2>&1)"
    echo "请安装 Python 3.10 或更高版本（推荐 3.12）"
    exit 1
fi

echo "Python: $("$PYTHON_CMD" --version 2>&1)"

MISSING_MODULES=()
if ! "$PYTHON_CMD" -c 'import docx' >/dev/null 2>&1; then
    MISSING_MODULES+=("python-docx (.docx 文本提取)")
fi
if ! "$PYTHON_CMD" -c 'import PyPDF2' >/dev/null 2>&1; then
    MISSING_MODULES+=("PyPDF2 (PDF 文本提取)")
fi
if [ ${#MISSING_MODULES[@]} -gt 0 ]; then
    echo "[WARN] 缺少可选依赖:"
    for MODULE in "${MISSING_MODULES[@]}"; do
        echo "  - $MODULE"
    done
    echo "安装命令: $PYTHON_CMD -m pip install -r requirements.txt"
fi

if command -v soffice >/dev/null 2>&1 || command -v libreoffice >/dev/null 2>&1 || [ -x "/Applications/LibreOffice.app/Contents/MacOS/soffice" ]; then
    echo "LibreOffice: 已检测到"
else
    echo "[WARN] 未检测到 LibreOffice，Word 文档转换和预览功能可能不可用。"
fi

echo "============================================"
echo "   Assignment_Dashboard"
echo "   URL: http://localhost:${PORT}"
echo "============================================"
echo ""

if [ ! -f "py/server.py" ]; then
    echo "[ERROR] 当前目录未找到 py/server.py"
    echo "路径: $(pwd)"
    exit 1
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
    echo "启动脚本检查通过"
    exit 0
fi

mkdir -p logs data

if [ "$BACKGROUND" -eq 1 ] && [ "$BACKGROUND_WORKER" -eq 0 ]; then
    nohup "$0" --background-worker "${SERVER_ARGS[@]}" >> logs/dashboard.log 2>&1 </dev/null &
    WORKER_PID=$!
    echo "$WORKER_PID" > data/start-worker.pid
    echo "服务已在后台启动，PID: $WORKER_PID"
    echo "日志: $(pwd)/logs/dashboard.log"
    echo "关闭终端不会停止后台服务；可在网页管理页关闭服务。"
    exit 0
fi

RESTARTS=0
MAX_RESTARTS=3

while true; do
    echo "Starting server with: $PYTHON_CMD -B -u"
    echo "按 Ctrl+C 停止"
    echo ""

    set +e
    "$PYTHON_CMD" -B -u py/server.py "${SERVER_ARGS[@]}"
    EXIT_CODE=$?
    set -e

    if [ "$STOP_REQUESTED" -eq 1 ]; then
        echo "服务已停止"
        exit 0
    fi

    if [ $EXIT_CODE -eq 0 ]; then
        echo ""
        echo "============================================"
        echo "服务已正常停止或已有实例在运行"
        echo "访问: http://localhost:${PORT}"
        echo "============================================"
        exit 0
    fi

    RESTARTS=$((RESTARTS + 1))
    echo ""
    echo "============================================"
    echo "服务异常退出，退出码: $EXIT_CODE"
    echo "5秒后重启... 第 $RESTARTS 次"
    echo "按 Ctrl+C 退出"
    echo "============================================"
    sleep 5

    if [ $RESTARTS -ge $MAX_RESTARTS ]; then
        echo ""
        echo "============================================"
        echo "服务多次启动失败"
        echo "如有更新包，请使用离线修复工具:"
        echo "  $PYTHON_CMD py/repair_update.py"
        echo "============================================"
        if [ "$BACKGROUND_WORKER" -eq 1 ] || [ ! -t 0 ]; then
            echo "后台服务停止重试，请查看 logs/dashboard.log"
            exit 1
        fi
        read -r -p "是否继续重试？(y/N) " ANSWER
        if [ "$ANSWER" != "y" ] && [ "$ANSWER" != "Y" ]; then
            exit 1
        fi
        RESTARTS=0
    fi
done
