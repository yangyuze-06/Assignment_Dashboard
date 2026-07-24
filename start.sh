#!/bin/bash
# Assignment_Dashboard - macOS/Linux 启动脚本
# 用法: ./start.sh [额外参数]

set -e
cd "$(dirname "$0")"

PORT=18765
PYTHON_CMD=""

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

if [ "$1" = "--check" ]; then
    echo "启动脚本检查通过"
    exit 0
fi

RESTARTS=0
MAX_RESTARTS=3

while true; do
    echo "Starting server with: $PYTHON_CMD -B -u"
    echo "按 Ctrl+C 停止"
    echo ""

    set +e
    $PYTHON_CMD -B -u py/server.py "$@"
    EXIT_CODE=$?
    set -e

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
        read -p "是否继续重试？(y/N) " ANSWER
        if [ "$ANSWER" != "y" ] && [ "$ANSWER" != "Y" ]; then
            exit 1
        fi
        RESTARTS=0
    fi
done
