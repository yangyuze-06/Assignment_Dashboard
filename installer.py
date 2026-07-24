#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
作业追踪器 - 图形化安装向导
维护者: Assignment_Dashboard 项目贡献者
7步安装流程：欢迎→环境检测→班级设置→安装与目录配置→文件类型设置→科目关键词→安装执行
"""

import os
import sys
import json
import shutil
import zipfile
import urllib.request
import urllib.error
import tempfile
import subprocess
import traceback
import uuid
import tkinter as tk
from tkinter import ttk, messagebox, filedialog, simpledialog
import threading

# ============================================================
# 常量配置
# ============================================================

APP_NAME = "作业追踪器"
APP_VERSION = "0.1.1"
APP_PORT = 18765
AUTHOR = "项目贡献者"
SUPPORT_URL = "https://github.com/Trip1eY/Assignment_Dashboard/issues/new/choose"

# 嵌入版 Python 下载地址
PYTHON_EMBED_URL = "https://www.python.org/ftp/python/3.12.4/python-3.12.4-embed-amd64.zip"
PYTHON_EMBED_SIZE_MB = 8  # 约8MB

# 默认安装目录
DEFAULT_INSTALL_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "作业追踪器")

# 科目预设
DEFAULT_SUBJECTS = {
    "课程报告": ["课程报告", "报告", "学习报告"],
    "课程论文": ["课程论文", "论文", "期末论文"],
    "项目作业": ["项目作业", "项目", "小组项目"],
    "实验报告": ["实验报告", "实验", "实训报告"],
    "课程设计": ["课程设计", "课设", "设计报告"],
    "小组作业": ["小组作业", "小组报告", "展示"],
    "数字电子技术": ["数电", "数字电路", "数字电子技术"],
    "程序设计": ["C语言", "Python", "编程"]
}

# 文件类型分组
FILE_TYPE_GROUPS = {
    "办公文档": [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"],
    "图片": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"],
    "压缩包": [".zip", ".rar", ".7z", ".tar", ".gz"]
}

# 需要安装到目标目录的文件列表
INSTALL_FILES = [
    "server.py",
    "ai_classifier.py",
    "restart_helper.py",
    "dashboard.html",
    "dashboard_modern.html",
    "static/classic.css",
    "static/classic.js",
    "static/modern.css",
    "static/modern.js",
    "pack.py",
    "repair_update.py",
    "requirements.txt",
    "repair_update.bat",
    "更新修复工具.bat",
    "start.sh",
]

PROTECTED_INSTALL_DIRS = {
    os.path.normcase(os.path.abspath(os.path.expanduser("~"))),
    os.path.normcase(os.path.abspath(os.path.join(os.path.expanduser("~"), "Desktop"))),
    os.path.normcase(os.path.abspath(os.path.join(os.path.expanduser("~"), "Documents"))),
    os.path.normcase(os.path.abspath(os.path.join(os.path.expanduser("~"), "Downloads"))),
    os.path.normcase(os.path.abspath(os.environ.get("ProgramFiles", r"C:\Program Files"))),
    os.path.normcase(os.path.abspath(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"))),
    os.path.normcase(os.path.abspath(os.environ.get("WINDIR", r"C:\Windows"))),
}

# PyInstaller 打包时的资源路径
def get_resource_path(relative_path):
    """获取资源文件路径（兼容 PyInstaller 打包和直接运行）"""
    if getattr(sys, 'frozen', False):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)


def _is_drive_root(path):
    drive, tail = os.path.splitdrive(os.path.abspath(path))
    return bool(drive) and tail in ("\\", "/")


# ============================================================
# 安装向导 GUI
# ============================================================

class InstallerWizard:
    """7步安装向导"""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"{APP_NAME} v{APP_VERSION} - 安装向导")
        self.root.geometry("680x620")
        self.root.resizable(True, True)
        self.root.minsize(680, 620)
        
        # 居中窗口
        self.root.update_idletasks()
        w = self.root.winfo_width()
        h = self.root.winfo_height()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.root.geometry(f"+{(sw-w)//2}+{(sh-h)//2}")
        
        # 配色
        self.colors = {
            "bg": "#0f1117",
            "bg_card": "#1a1d2e",
            "bg_input": "#1e2030",
            "border": "#2a2d3e",
            "text": "#e1e4ed",
            "text_secondary": "#8b8fa3",
            "text_muted": "#5a5e72",
            "accent": "#22c55e",
            "accent_hover": "#16a34a",
            "danger": "#ef4444",
            "warning": "#f59e0b",
            "info": "#3b82f6",
        }
        
        self.root.configure(bg=self.colors["bg"])
        
        # 安装状态数据
        self.step = 0  # 当前步骤 0-6
        self.python_ok = False
        self.pip_ok = False
        self.class_name = "课程班级"
        self.install_dir = DEFAULT_INSTALL_DIR
        self.scan_dirs = []  # [(显示路径, 绝对路径)]
        self.data_dir = ""
        self.file_types = [".pdf", ".docx", ".doc"]
        self.subjects = dict(DEFAULT_SUBJECTS)  # 深拷贝
        self.create_desktop_bat = True
        
        # 进度
        self.progress_var = tk.DoubleVar(value=0)
        self.progress_text = tk.StringVar(value="")
        self.install_log = []
        
        # 构建界面
        self._build_ui()
        self._show_step(0)
    
    def _build_ui(self):
        """构建UI框架"""
        # 顶部标题
        title_frame = tk.Frame(self.root, bg=self.colors["bg_card"], height=56)
        title_frame.pack(fill=tk.X)
        title_frame.pack_propagate(False)
        
        tk.Label(
            title_frame, 
            text=f"📋 {APP_NAME}",
            font=("Segoe UI", 18, "bold"),
            fg=self.colors["accent"],
            bg=self.colors["bg_card"]
        ).pack(side=tk.LEFT, padx=20, pady=10)
        
        tk.Label(
            title_frame,
            text=f"v{APP_VERSION}",
            font=("Segoe UI", 10),
            fg=self.colors["text_muted"],
            bg=self.colors["bg_card"]
        ).pack(side=tk.LEFT, padx=(0, 20), pady=10)
        
        # 步骤指示器
        self.step_frame = tk.Frame(self.root, bg=self.colors["bg"])
        self.step_frame.pack(fill=tk.X, padx=20, pady=(12, 0))
        
        self.step_labels = []
        self.step_names = ["欢迎", "环境检测", "班级设置", "安装与目录", "文件类型", "科目关键词", "执行安装"]
        
        for i, name in enumerate(self.step_names):
            lbl = tk.Label(
                self.step_frame,
                text=f"{i+1}. {name}",
                font=("Segoe UI", 9),
                fg=self.colors["text_muted"],
                bg=self.colors["bg"]
            )
            lbl.pack(side=tk.LEFT, padx=4)
            self.step_labels.append(lbl)
        
        # 分隔线
        sep = tk.Frame(self.root, bg=self.colors["border"], height=1)
        sep.pack(fill=tk.X, padx=20, pady=(8, 0))
        
        # 内容区域
        self.content_frame = tk.Frame(self.root, bg=self.colors["bg"])
        self.content_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=16)
        
        # 底部按钮
        btn_frame = tk.Frame(self.root, bg=self.colors["bg"])
        btn_frame.pack(fill=tk.X, padx=20, pady=(0, 16))
        
        self.btn_back = tk.Button(
            btn_frame, text="← 上一步", 
            command=self._prev_step,
            font=("Segoe UI", 10),
            bg=self.colors["bg_card"], fg=self.colors["text"],
            activebackground=self.colors["border"],
            relief=tk.FLAT, bd=0, padx=16, pady=8,
            cursor="hand2"
        )
        self.btn_back.pack(side=tk.LEFT)
        
        self.btn_next = tk.Button(
            btn_frame, text="下一步 →",
            command=self._next_step,
            font=("Segoe UI", 10, "bold"),
            bg=self.colors["accent"], fg="#000",
            activebackground=self.colors["accent_hover"],
            relief=tk.FLAT, bd=0, padx=20, pady=8,
            cursor="hand2"
        )
        self.btn_next.pack(side=tk.RIGHT)
    
    def _clear_content(self):
        """清空内容区域"""
        for widget in self.content_frame.winfo_children():
            widget.destroy()
    
    def _update_step_indicator(self):
        """更新步骤指示器样式"""
        for i, lbl in enumerate(self.step_labels):
            if i == self.step:
                lbl.configure(fg=self.colors["accent"], font=("Segoe UI", 9, "bold"))
            elif i < self.step:
                lbl.configure(fg=self.colors["text_secondary"])
            else:
                lbl.configure(fg=self.colors["text_muted"])
    
    def _show_step(self, step):
        """切换到指定步骤"""
        self.step = step
        self._clear_content()
        self._update_step_indicator()
        
        # 更新按钮状态
        if step == 0:
            self.btn_back.configure(state=tk.DISABLED)
        else:
            self.btn_back.configure(state=tk.NORMAL)
        
        if step == 6:
            self.btn_next.configure(text="完成 ✓", state=tk.DISABLED)
        else:
            self.btn_next.configure(text="下一步 →", state=tk.NORMAL)
        
        # 渲染步骤内容
        step_methods = [
            self._step_welcome,
            self._step_env_check,
            self._step_class,
            self._step_dirs,
            self._step_file_types,
            self._step_subjects,
            self._step_install
        ]
        step_methods[step]()
    
    def _next_step(self):
        """下一步"""
        if self.step < 6:
            # 如果即将进入环境检测页，先显示加载提示
            if self.step + 1 == 1:
                self._show_loading("正在检测系统环境...")
                self.root.after(100, lambda: self._show_step(self.step + 1))
            else:
                self._show_step(self.step + 1)
        else:
            self.root.quit()

    def _get_class_name_value(self):
        try:
            if hasattr(self, "class_entry"):
                return self.class_entry.get().strip() or self.class_name
        except Exception:
            pass
        return self.class_name or "未命名班级"

    def _default_class_folder(self, class_name=None):
        return os.path.join(os.path.expanduser("~"), "Desktop", class_name or self._get_class_name_value())

    def _default_experiment_dir(self, class_name=None):
        return os.path.join(self._default_class_folder(class_name), "实验")

    def _default_homework_dir(self, install_dir=None):
        return os.path.join(install_dir or self.install_dir, "homework")

    def _default_scan_dirs(self, install_dir=None, class_name=None):
        dirs = [self._default_experiment_dir(class_name), self._default_homework_dir(install_dir)]
        result = []
        for d in dirs:
            if d and d not in result:
                result.append(d)
        return result

    def _ensure_safe_install_dir(self, install_dir):
        """阻止把安装目录直接选成桌面、用户根目录或系统目录。"""
        abs_dir = os.path.abspath(os.path.expandvars(os.path.expanduser(install_dir or "")))
        if not abs_dir or _is_drive_root(abs_dir):
            raise ValueError("安装目录不能是磁盘根目录，请选择一个专用文件夹。")
        if os.path.normcase(abs_dir) in PROTECTED_INSTALL_DIRS:
            raise ValueError("安装目录不能直接选择桌面、用户目录、下载目录或系统目录，请选择一个专用文件夹。")
        return abs_dir

    def _new_install_journal(self):
        return {
            "created_dirs": [],
            "files": {},
            "backup_dir": tempfile.mkdtemp(prefix="assignment_dashboard_installer_rollback_"),
        }

    def _remember_dir(self, journal, path):
        abs_path = os.path.abspath(path)
        existed = os.path.exists(abs_path)
        os.makedirs(abs_path, exist_ok=True)
        if not existed:
            journal["created_dirs"].append(abs_path)

    def _remember_file_before_write(self, journal, path):
        abs_path = os.path.abspath(path)
        if abs_path in journal["files"]:
            return
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        if os.path.exists(abs_path):
            backup_name = f"{uuid.uuid4().hex}_{os.path.basename(abs_path)}"
            backup_path = os.path.join(journal["backup_dir"], backup_name)
            shutil.copy2(abs_path, backup_path)
            journal["files"][abs_path] = {"existed": True, "backup": backup_path}
        else:
            journal["files"][abs_path] = {"existed": False, "backup": None}

    def _write_json_file(self, journal, path, payload):
        self._remember_file_before_write(journal, path)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    def _write_text_file(self, journal, path, content):
        self._remember_file_before_write(journal, path)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    def _copy_install_file(self, journal, src, dst):
        self._remember_file_before_write(journal, dst)
        shutil.copy2(src, dst)

    def _cleanup_install_journal(self, journal):
        backup_dir = journal.get("backup_dir") if journal else None
        if backup_dir and os.path.exists(backup_dir):
            shutil.rmtree(backup_dir, ignore_errors=True)
    
    def _show_loading(self, text="加载中..."):
        """显示加载中提示"""
        self._clear_content()
        self.btn_back.configure(state=tk.DISABLED)
        self.btn_next.configure(state=tk.DISABLED, text="请稍候...")
        
        tk.Label(
            self.content_frame,
            text="⏳",
            font=("Segoe UI", 48),
            fg=self.colors["accent"],
            bg=self.colors["bg"]
        ).pack(pady=(80, 16))
        
        tk.Label(
            self.content_frame,
            text=text,
            font=("Segoe UI", 14),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"]
        ).pack()
        
        tk.Label(
            self.content_frame,
            text="请稍候，正在进行系统检查...",
            font=("Segoe UI", 10),
            fg=self.colors["text_muted"],
            bg=self.colors["bg"]
        ).pack(pady=(8, 0))
        
        self.root.update_idletasks()
    
    def _prev_step(self):
        """上一步"""
        if self.step > 0:
            self._show_step(self.step - 1)
    
    # ============================================================
    # Step 0: 欢迎页
    # ============================================================
    def _step_welcome(self):
        frame = tk.Frame(self.content_frame, bg=self.colors["bg"])
        frame.pack(fill=tk.BOTH, expand=True)
        
        # Logo 区域
        tk.Label(
            frame,
            text="📋",
            font=("Segoe UI", 64),
            fg=self.colors["accent"],
            bg=self.colors["bg"]
        ).pack(pady=(30, 10))
        
        tk.Label(
            frame,
            text=APP_NAME,
            font=("Segoe UI", 26, "bold"),
            fg=self.colors["text"],
            bg=self.colors["bg"]
        ).pack()
        
        tk.Label(
            frame,
            text=f"版本 {APP_VERSION} · By {AUTHOR}",
            font=("Segoe UI", 11),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"]
        ).pack(pady=(4, 20))
        
        # 功能说明
        features = [
            "🔍 自动扫描微信文件夹中的作业文件",
            "🏷️ 智能关键词归类到对应科目",
            "📢 公告推送系统，随时发布更新通知",
            "🔄 在线更新模块，修复bug无需重装",
        ]
        
        for feat in features:
            tk.Label(
                frame,
                text=feat,
                font=("Segoe UI", 11),
                fg=self.colors["text_secondary"],
                bg=self.colors["bg"],
                justify=tk.LEFT
            ).pack(anchor=tk.W, padx=60, pady=2)
        
        tk.Label(
            frame,
            text="\n点击「下一步」开始安装配置",
            font=("Segoe UI", 10),
            fg=self.colors["text_muted"],
            bg=self.colors["bg"]
        ).pack(pady=(16, 0))
    
    # ============================================================
    # Step 1: 环境检测
    # ============================================================
    def _step_env_check(self):
        frame = tk.Frame(self.content_frame, bg=self.colors["bg"])
        frame.pack(fill=tk.BOTH, expand=True)
        
        tk.Label(
            frame,
            text="🔧 环境检测",
            font=("Segoe UI", 16, "bold"),
            fg=self.colors["text"],
            bg=self.colors["bg"]
        ).pack(pady=(10, 6))
        
        tk.Label(
            frame,
            text="正在检测系统运行环境...",
            font=("Segoe UI", 10),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"]
        ).pack(pady=(0, 16))
        
        # 检测结果容器
        self.env_result_frame = tk.Frame(frame, bg=self.colors["bg"])
        self.env_result_frame.pack(fill=tk.X, padx=40)
        
        # 执行检测
        self._run_env_check()
    
    def _find_python(self):
        """查找系统可用的 Python"""
        candidates = [
            "python",
            "python3",
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Python", "Python313", "python.exe"),
            os.path.join(os.environ.get("ProgramFiles", "C:\\Program Files"), "Python313", "python.exe"),
        ]
        for cmd in candidates:
            try:
                result = subprocess.run([cmd, "--version"], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    return cmd, (result.stdout.strip() or result.stderr.strip())
            except Exception:
                continue
        return None, None

    def _run_env_check(self):
        """执行环境检测"""
        # 清空
        for w in self.env_result_frame.winfo_children():
            w.destroy()
        
        # 检测 Python（打包成exe后 sys.executable 不再指向系统python，改用路径查找）
        python_cmd, py_version = self._find_python()
        
        if python_cmd:
            self.python_ok = True
            self._python_cmd = python_cmd
            status_text = f"✅ Python 已安装: {py_version}"
            status_color = self.colors["accent"]
        else:
            self.python_ok = False
            status_text = f"⚠️ Python 未安装"
            status_color = self.colors["warning"]
        
        self._add_env_row("Python 运行环境", status_text, status_color)
        
        # 检测 pip
        if python_cmd:
            try:
                result = subprocess.run(
                    [python_cmd, "-m", "pip", "--version"],
                    capture_output=True, text=True, timeout=10
                )
                pip_version = result.stdout.strip().split()[1] if result.stdout else "已安装"
                self.pip_ok = True
                status_text = f"✅ pip 已安装: {pip_version}"
                status_color = self.colors["accent"]
            except Exception:
                self.pip_ok = False
                status_text = f"⚠️ pip 未安装"
                status_color = self.colors["warning"]
        else:
            self.pip_ok = False
            status_text = f"⚠️ 未检测到 Python"
            status_color = self.colors["warning"]
        
        self._add_env_row("pip 包管理器", status_text, status_color)
        
        # 如果 Python 未安装，提供下载选项
        if not self.python_ok:
            tk.Label(
                self.env_result_frame,
                text="\n💡 未检测到 Python，系统将自动下载嵌入版 Python 并安装到目标目录。",
                font=("Segoe UI", 10),
                fg=self.colors["info"],
                bg=self.colors["bg"],
                justify=tk.LEFT,
                wraplength=550
            ).pack(anchor=tk.W, pady=(12, 4))
            
            tk.Label(
                self.env_result_frame,
                text=f"下载地址: {PYTHON_EMBED_URL}\n大小: 约 {PYTHON_EMBED_SIZE_MB} MB",
                font=("Segoe UI", 9),
                fg=self.colors["text_muted"],
                bg=self.colors["bg"],
                justify=tk.LEFT
            ).pack(anchor=tk.W, pady=(0, 8))
            
            self.btn_next.configure(text="继续安装（将下载Python）→")
        else:
            tk.Label(
                self.env_result_frame,
                text="\n✅ 环境检测通过，可以继续安装。",
                font=("Segoe UI", 10),
                fg=self.colors["accent"],
                bg=self.colors["bg"]
            ).pack(anchor=tk.W, pady=(12, 0))
    
    def _add_env_row(self, label, status, color):
        """添加环境检测结果行"""
        row = tk.Frame(self.env_result_frame, bg=self.colors["bg"])
        row.pack(fill=tk.X, pady=4)
        
        tk.Label(
            row, text=label,
            font=("Segoe UI", 11),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"],
            width=16, anchor=tk.W
        ).pack(side=tk.LEFT)
        
        tk.Label(
            row, text=status,
            font=("Segoe UI", 11),
            fg=color,
            bg=self.colors["bg"]
        ).pack(side=tk.LEFT)
    
    # ============================================================
    # Step 2: 班级设置
    # ============================================================
    def _step_class(self):
        frame = tk.Frame(self.content_frame, bg=self.colors["bg"])
        frame.pack(fill=tk.BOTH, expand=True)
        
        tk.Label(
            frame,
            text="🏫 班级设置",
            font=("Segoe UI", 16, "bold"),
            fg=self.colors["text"],
            bg=self.colors["bg"]
        ).pack(pady=(10, 6))
        
        tk.Label(
            frame,
            text="设置班级名称，将显示在仪表盘标题栏中",
            font=("Segoe UI", 10),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"]
        ).pack(pady=(0, 20))
        
        # 输入框
        input_frame = tk.Frame(frame, bg=self.colors["bg"])
        input_frame.pack(fill=tk.X, padx=60)
        
        tk.Label(
            input_frame,
            text="班级名称:",
            font=("Segoe UI", 11),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"]
        ).pack(anchor=tk.W)
        
        self.class_entry = tk.Entry(
            input_frame,
            font=("Segoe UI", 14),
            bg=self.colors["bg_input"],
            fg=self.colors["text"],
            insertbackground=self.colors["accent"],
            relief=tk.FLAT,
            bd=8
        )
        self.class_entry.insert(0, self.class_name)
        self.class_entry.pack(fill=tk.X, pady=(6, 10))
        
        # 预览
        self.class_preview = tk.Label(
            input_frame,
            text=f"预览: 仪表盘将显示「{self.class_name}」",
            font=("Segoe UI", 10),
            fg=self.colors["accent"],
            bg=self.colors["bg"]
        )
        self.class_preview.pack(anchor=tk.W)
        
        # 实时预览更新
        def on_class_change(*args):
            name = self.class_entry.get().strip() or "未命名班级"
            self.class_name = name
            self.class_preview.configure(text=f"预览: 仪表盘将显示「{name}」")
        
        self.class_entry.bind("<KeyRelease>", on_class_change)
    
    # ============================================================
    # Step 3: 安装与目录配置
    # ============================================================
    def _step_dirs(self):
        frame = tk.Frame(self.content_frame, bg=self.colors["bg"])
        frame.pack(fill=tk.BOTH, expand=True)
        
        tk.Label(
            frame,
            text="📁 安装与目录配置",
            font=("Segoe UI", 16, "bold"),
            fg=self.colors["text"],
            bg=self.colors["bg"]
        ).pack(pady=(10, 6))
        
        tk.Label(
            frame,
            text="配置安装目录和作业扫描目录",
            font=("Segoe UI", 10),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"]
        ).pack(pady=(0, 16))
        
        # 使用可滚动的 Canvas
        canvas = tk.Canvas(frame, bg=self.colors["bg"], highlightthickness=0, height=280)
        scrollbar = tk.Scrollbar(frame, orient=tk.VERTICAL, command=canvas.yview)
        scroll_frame = tk.Frame(canvas, bg=self.colors["bg"])
        
        scroll_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=scroll_frame, anchor=tk.NW)
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=40)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # 安装目录
        tk.Label(
            scroll_frame,
            text="安装目录:",
            font=("Segoe UI", 11, "bold"),
            fg=self.colors["text"],
            bg=self.colors["bg"]
        ).pack(anchor=tk.W, pady=(0, 4))
        
        dir_row = tk.Frame(scroll_frame, bg=self.colors["bg"])
        dir_row.pack(fill=tk.X)
        
        self.install_dir_entry = tk.Entry(
            dir_row,
            font=("Segoe UI", 10),
            bg=self.colors["bg_input"],
            fg=self.colors["text"],
            insertbackground=self.colors["accent"],
            relief=tk.FLAT,
            bd=6
        )
        self.install_dir_entry.insert(0, self.install_dir)
        self.install_dir_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        tk.Button(
            dir_row, text="浏览...",
            command=self._browse_install_dir,
            font=("Segoe UI", 9),
            bg=self.colors["bg_card"], fg=self.colors["text"],
            activebackground=self.colors["border"],
            relief=tk.FLAT, bd=0, padx=10, pady=4,
            cursor="hand2"
        ).pack(side=tk.LEFT, padx=(6, 0))
        
        # 桌面BAT脚本
        self.bat_var = tk.BooleanVar(value=True)
        tk.Checkbutton(
            scroll_frame,
            text="在桌面创建启动脚本 (启动作业追踪器.bat)",
            variable=self.bat_var,
            font=("Segoe UI", 10),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"],
            selectcolor=self.colors["bg_input"],
            activebackground=self.colors["bg"],
            activeforeground=self.colors["text"]
        ).pack(anchor=tk.W, pady=(12, 6))
        
        # 分隔
        tk.Frame(scroll_frame, bg=self.colors["border"], height=1).pack(fill=tk.X, pady=(12, 12))
        
        # 扫描目录
        tk.Label(
            scroll_frame,
            text="作业扫描目录:",
            font=("Segoe UI", 11, "bold"),
            fg=self.colors["text"],
            bg=self.colors["bg"]
        ).pack(anchor=tk.W, pady=(0, 4))
        
        tk.Label(
            scroll_frame,
            text="💡 微信接收文件会自动发现；这里用于“扫描已有文件”，默认包含 桌面\\班级\\公示文件夹 和安装目录 homework",
            font=("Segoe UI", 9),
            fg=self.colors["text_muted"],
            bg=self.colors["bg"]
        ).pack(anchor=tk.W, pady=(0, 8))
        
        # 扫描目录列表
        self.scan_dirs_list_frame = tk.Frame(scroll_frame, bg=self.colors["bg"])
        self.scan_dirs_list_frame.pack(fill=tk.X)
        
        # 初始添加默认扫描目录：公示/作业目录 + 本地手动投递目录
        if not self.scan_dirs:
            self.scan_dirs = self._default_scan_dirs(self.install_dir, self._get_class_name_value())
        self._render_scan_dirs()
        
        # 添加目录行
        add_frame = tk.Frame(scroll_frame, bg=self.colors["bg"])
        add_frame.pack(fill=tk.X, pady=(8, 0))
        
        self.new_scan_dir_entry = tk.Entry(
            add_frame,
            font=("Segoe UI", 10),
            bg=self.colors["bg_input"],
            fg=self.colors["text"],
            insertbackground=self.colors["accent"],
            relief=tk.FLAT,
            bd=6
        )
        self.new_scan_dir_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.new_scan_dir_entry.bind("<Return>", lambda e: self._add_scan_dir())
        
        tk.Button(
            add_frame, text="+ 添加",
            command=self._add_scan_dir,
            font=("Segoe UI", 9),
            bg=self.colors["accent"], fg="#000",
            activebackground=self.colors["accent_hover"],
            relief=tk.FLAT, bd=0, padx=12, pady=4,
            cursor="hand2"
        ).pack(side=tk.LEFT, padx=(6, 0))
        
        tk.Button(
            add_frame, text="📂 浏览",
            command=self._browse_scan_dir,
            font=("Segoe UI", 9),
            bg=self.colors["bg_card"], fg=self.colors["text"],
            activebackground=self.colors["border"],
            relief=tk.FLAT, bd=0, padx=10, pady=4,
            cursor="hand2"
        ).pack(side=tk.LEFT, padx=(6, 0))
        
        # 数据存储目录
        tk.Frame(scroll_frame, bg=self.colors["border"], height=1).pack(fill=tk.X, pady=(12, 12))
        
        tk.Label(
            scroll_frame,
            text="数据存储目录（固定在安装目录 data/，用于配置和提交记录）:",
            font=("Segoe UI", 11, "bold"),
            fg=self.colors["text"],
            bg=self.colors["bg"]
        ).pack(anchor=tk.W, pady=(0, 4))
        
        self.data_dir_entry = tk.Entry(
            scroll_frame,
            font=("Segoe UI", 10),
            bg=self.colors["bg_input"],
            fg=self.colors["text"],
            insertbackground=self.colors["accent"],
            relief=tk.FLAT,
            bd=6
        )
        self.data_dir_entry.insert(0, os.path.join(self.install_dir, "data"))
        self.data_dir_entry.configure(state=tk.DISABLED)
        self.data_dir_entry.pack(fill=tk.X, pady=(4, 0))
    
    def _render_scan_dirs(self):
        """渲染扫描目录列表"""
        for w in self.scan_dirs_list_frame.winfo_children():
            w.destroy()
        
        self._scan_dir_vars = []
        
        for i, d in enumerate(self.scan_dirs):
            row = tk.Frame(self.scan_dirs_list_frame, bg=self.colors["bg"])
            row.pack(fill=tk.X, pady=2)
            
            var = tk.StringVar(value=d)
            self._scan_dir_vars.append(var)
            
            entry = tk.Entry(
                row,
                textvariable=var,
                font=("Segoe UI", 10),
                bg=self.colors["bg_input"],
                fg=self.colors["text"],
                insertbackground=self.colors["accent"],
                relief=tk.FLAT,
                bd=4
            )
            entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
            
            tk.Button(
                row, text="×",
                command=lambda idx=i: self._remove_scan_dir(idx),
                font=("Segoe UI", 10, "bold"),
                fg=self.colors["danger"],
                bg=self.colors["bg"],
                activebackground=self.colors["bg"],
                relief=tk.FLAT,
                bd=0,
                cursor="hand2"
            ).pack(side=tk.RIGHT, padx=(6, 0))
    
    def _add_scan_dir(self):
        """添加扫描目录"""
        if not hasattr(self, 'new_scan_dir_entry'):
            return
        try:
            path = self.new_scan_dir_entry.get().strip()
        except Exception:
            return
        if not path:
            messagebox.showwarning("提示", "请输入目录路径", parent=self.root)
            return
        self.scan_dirs.append(path)
        self.new_scan_dir_entry.delete(0, tk.END)
        self._render_scan_dirs()
    
    def _remove_scan_dir(self, index):
        """移除扫描目录"""
        if len(self.scan_dirs) <= 1:
            messagebox.showwarning("提示", "至少需要保留一个扫描目录", parent=self.root)
            return
        self.scan_dirs.pop(index)
        self._render_scan_dirs()
    
    def _browse_install_dir(self):
        """浏览选择安装目录"""
        path = filedialog.askdirectory(title="选择安装目录", parent=self.root)
        if path:
            old_install = self.install_dir_entry.get().strip() or self.install_dir
            old_homework = self._default_homework_dir(old_install)
            self.install_dir_entry.delete(0, tk.END)
            self.install_dir_entry.insert(0, path)
            self.install_dir = path
            if hasattr(self, "data_dir_entry"):
                self.data_dir_entry.configure(state=tk.NORMAL)
                self.data_dir_entry.delete(0, tk.END)
                self.data_dir_entry.insert(0, os.path.join(path, "data"))
                self.data_dir_entry.configure(state=tk.DISABLED)
            new_homework = self._default_homework_dir(path)
            self.scan_dirs = [new_homework if d == old_homework else d for d in self.scan_dirs]
            if new_homework not in self.scan_dirs:
                self.scan_dirs.append(new_homework)
            if hasattr(self, "scan_dirs_list_frame"):
                self._render_scan_dirs()
    
    def _browse_scan_dir(self):
        """浏览选择扫描目录"""
        path = filedialog.askdirectory(title="选择作业扫描目录", parent=self.root)
        if path:
            self.scan_dirs.append(path)
            self._render_scan_dirs()
    
    # ============================================================
    # Step 4: 文件类型设置
    # ============================================================
    def _step_file_types(self):
        frame = tk.Frame(self.content_frame, bg=self.colors["bg"])
        frame.pack(fill=tk.BOTH, expand=True)
        
        tk.Label(
            frame,
            text="📄 文件类型设置",
            font=("Segoe UI", 16, "bold"),
            fg=self.colors["text"],
            bg=self.colors["bg"]
        ).pack(pady=(10, 6))
        
        tk.Label(
            frame,
            text="选择需要扫描追踪的文件格式（勾选即启用）",
            font=("Segoe UI", 10),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"]
        ).pack(pady=(0, 16))
        
        # 文件类型复选框
        self.file_type_vars = {}
        
        for group_name, extensions in FILE_TYPE_GROUPS.items():
            group_frame = tk.Frame(frame, bg=self.colors["bg"])
            group_frame.pack(fill=tk.X, padx=60, pady=(0, 12))
            
            tk.Label(
                group_frame,
                text=f"📁 {group_name}:",
                font=("Segoe UI", 11, "bold"),
                fg=self.colors["text"],
                bg=self.colors["bg"]
            ).pack(anchor=tk.W, pady=(0, 4))
            
            ext_frame = tk.Frame(group_frame, bg=self.colors["bg"])
            ext_frame.pack(fill=tk.X)
            
            for ext in extensions:
                var = tk.BooleanVar(value=ext in self.file_types)
                self.file_type_vars[ext] = var
                
                tk.Checkbutton(
                    ext_frame,
                    text=ext,
                    variable=var,
                    font=("Segoe UI", 10),
                    fg=self.colors["text_secondary"],
                    bg=self.colors["bg"],
                    selectcolor=self.colors["bg_input"],
                    activebackground=self.colors["bg"],
                    activeforeground=self.colors["text"]
                ).pack(side=tk.LEFT, padx=(0, 16))
    
    # ============================================================
    # Step 5: 科目关键词配置
    # ============================================================
    def _step_subjects(self):
        frame = tk.Frame(self.content_frame, bg=self.colors["bg"])
        frame.pack(fill=tk.BOTH, expand=True)
        
        tk.Label(
            frame,
            text="🏷️ 科目关键词配置",
            font=("Segoe UI", 16, "bold"),
            fg=self.colors["text"],
            bg=self.colors["bg"]
        ).pack(pady=(10, 6))
        
        tk.Label(
            frame,
            text="配置科目和关键词，系统将根据文件名自动归类作业",
            font=("Segoe UI", 10),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"]
        ).pack(pady=(0, 12))
        
        # 可滚动的科目列表
        canvas = tk.Canvas(frame, bg=self.colors["bg"], highlightthickness=0, height=280)
        scrollbar = tk.Scrollbar(frame, orient=tk.VERTICAL, command=canvas.yview)
        self.subjects_frame = tk.Frame(canvas, bg=self.colors["bg"])
        
        self.subjects_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=self.subjects_frame, anchor=tk.NW)
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=40)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self._render_subjects()
        
        # 添加科目
        add_frame = tk.Frame(frame, bg=self.colors["bg"])
        add_frame.pack(fill=tk.X, padx=40, pady=(8, 0))
        
        self.new_subject_entry = tk.Entry(
            add_frame,
            font=("Segoe UI", 10),
            bg=self.colors["bg_input"],
            fg=self.colors["text"],
            insertbackground=self.colors["accent"],
            relief=tk.FLAT,
            bd=6
        )
        self.new_subject_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.new_subject_entry.bind("<Return>", lambda e: self._add_subject())
        
        tk.Button(
            add_frame, text="+ 添加科目",
            command=self._add_subject,
            font=("Segoe UI", 9),
            bg=self.colors["accent"], fg="#000",
            activebackground=self.colors["accent_hover"],
            relief=tk.FLAT, bd=0, padx=12, pady=4,
            cursor="hand2"
        ).pack(side=tk.LEFT, padx=(6, 0))
    
    def _render_subjects(self):
        """渲染科目关键词列表"""
        for w in self.subjects_frame.winfo_children():
            w.destroy()
        
        for subject, keywords in self.subjects.items():
            subj_frame = tk.Frame(self.subjects_frame, bg=self.colors["bg_card"])
            subj_frame.pack(fill=tk.X, pady=4)
            
            # 标题行
            header = tk.Frame(subj_frame, bg=self.colors["bg_card"])
            header.pack(fill=tk.X, padx=10, pady=(8, 4))
            
            tk.Label(
                header,
                text=f"📚 {subject}",
                font=("Segoe UI", 11, "bold"),
                fg=self.colors["text"],
                bg=self.colors["bg_card"]
            ).pack(side=tk.LEFT)
            
            tk.Button(
                header, text="删除科目",
                command=lambda s=subject: self._remove_subject(s),
                font=("Segoe UI", 8),
                fg=self.colors["danger"],
                bg=self.colors["bg_card"],
                activebackground=self.colors["bg_card"],
                relief=tk.FLAT,
                bd=0,
                cursor="hand2"
            ).pack(side=tk.RIGHT)
            
            # 关键词标签
            kw_frame = tk.Frame(subj_frame, bg=self.colors["bg_card"])
            kw_frame.pack(fill=tk.X, padx=10, pady=(0, 4))
            
            for kw in keywords:
                kw_row = tk.Frame(kw_frame, bg=self.colors["bg_card"])
                kw_row.pack(side=tk.LEFT, padx=(0, 4), pady=2)
                
                tk.Label(
                    kw_row,
                    text=kw,
                    font=("Segoe UI", 9),
                    fg=self.colors["accent"],
                    bg=self.colors["bg_input"],
                    padx=8, pady=2
                ).pack(side=tk.LEFT)
                
                tk.Button(
                    kw_row, text="×",
                    command=lambda s=subject, k=kw: self._remove_keyword(s, k),
                    font=("Segoe UI", 8),
                    fg=self.colors["danger"],
                    bg=self.colors["bg_input"],
                    activebackground=self.colors["bg_input"],
                    relief=tk.FLAT,
                    bd=0,
                    cursor="hand2"
                ).pack(side=tk.LEFT)
            
            # 添加关键词输入
            add_kw_frame = tk.Frame(subj_frame, bg=self.colors["bg_card"])
            add_kw_frame.pack(fill=tk.X, padx=10, pady=(2, 8))
            
            kw_entry = tk.Entry(
                add_kw_frame,
                font=("Segoe UI", 9),
                bg=self.colors["bg_input"],
                fg=self.colors["text"],
                insertbackground=self.colors["accent"],
                relief=tk.FLAT,
                bd=4
            )
            kw_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
            kw_entry.bind("<Return>", lambda e, s=subject, entry=None: self._add_keyword_from_entry(s))
            
            tk.Button(
                add_kw_frame, text="+",
                command=lambda s=subject, e=None: self._add_keyword_from_entry(s),
                font=("Segoe UI", 9, "bold"),
                bg=self.colors["accent"], fg="#000",
                activebackground=self.colors["accent_hover"],
                relief=tk.FLAT, bd=0, padx=8, pady=2,
                cursor="hand2"
            ).pack(side=tk.LEFT, padx=(4, 0))
    
    def _add_subject(self):
        """添加科目"""
        name = self.new_subject_entry.get().strip()
        if not name:
            return
        if name in self.subjects:
            messagebox.showwarning("提示", f"科目「{name}」已存在", parent=self.root)
            return
        self.subjects[name] = []
        self.new_subject_entry.delete(0, tk.END)
        self._render_subjects()
    
    def _remove_subject(self, subject):
        """删除科目"""
        if messagebox.askyesno("确认", f"确定删除科目「{subject}」及其所有关键词？", parent=self.root):
            del self.subjects[subject]
            self._render_subjects()
    
    def _add_keyword_from_entry(self, subject):
        """从输入框添加关键词（通过遍历子组件找到对应输入框）"""
        # 简化处理：弹窗输入
        kw = simpledialog.askstring("添加关键词", f"为「{subject}」添加关键词:", parent=self.root)
        if kw and kw.strip():
            kw = kw.strip()
            if kw not in self.subjects.get(subject, []):
                self.subjects[subject].append(kw)
                self._render_subjects()
    
    def _remove_keyword(self, subject, keyword):
        """删除关键词"""
        if subject in self.subjects and keyword in self.subjects[subject]:
            self.subjects[subject].remove(keyword)
            self._render_subjects()
    
    # ============================================================
    # Step 6: 安装执行
    # ============================================================
    def _step_install(self):
        frame = tk.Frame(self.content_frame, bg=self.colors["bg"])
        frame.pack(fill=tk.BOTH, expand=True)
        
        tk.Label(
            frame,
            text="🚀 安装执行",
            font=("Segoe UI", 16, "bold"),
            fg=self.colors["text"],
            bg=self.colors["bg"]
        ).pack(pady=(10, 6))
        
        tk.Label(
            frame,
            text="正在安装，请稍候...",
            font=("Segoe UI", 10),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"]
        ).pack(pady=(0, 12))
        
        # 进度条
        self.progress_bar = ttk.Progressbar(
            frame,
            variable=self.progress_var,
            maximum=100,
            length=500
        )
        self.progress_bar.pack(pady=(8, 4))
        
        # 进度文字
        self.progress_label = tk.Label(
            frame,
            textvariable=self.progress_text,
            font=("Segoe UI", 9),
            fg=self.colors["text_secondary"],
            bg=self.colors["bg"]
        )
        self.progress_label.pack()
        
        # 日志区域
        log_frame = tk.Frame(frame, bg=self.colors["bg_input"])
        log_frame.pack(fill=tk.BOTH, expand=True, padx=40, pady=(12, 0))
        
        self.log_text = tk.Text(
            log_frame,
            font=("Consolas", 9),
            bg=self.colors["bg_input"],
            fg=self.colors["text_secondary"],
            relief=tk.FLAT,
            bd=6,
            height=12,
            wrap=tk.WORD,
            state=tk.DISABLED
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        # 开始安装
        self.root.after(500, self._execute_install)
    
    def _log(self, message, level="INFO"):
        """写入安装日志（线程安全，通过 root.after 调度到主线程）"""
        self.install_log.append((level, message))
        
        def _write():
            try:
                self.log_text.configure(state=tk.NORMAL)
                color = self.colors["text_secondary"]
                if level == "ERROR":
                    color = self.colors["danger"]
                elif level == "SUCCESS":
                    color = self.colors["accent"]
                elif level == "WARN":
                    color = self.colors["warning"]
                
                self.log_text.insert(tk.END, f"[{level}] {message}\n")
                line_start = self.log_text.index("end-2c linestart")
                self.log_text.tag_add(level, line_start, "end-1c")
                self.log_text.tag_configure(level, foreground=color)
                self.log_text.see(tk.END)
                self.log_text.configure(state=tk.DISABLED)
            except Exception:
                pass  # widget 可能已被销毁
        
        self.root.after(0, _write)
    
    def _set_progress(self, value, text):
        """设置进度（线程安全）"""
        def _update():
            try:
                self.progress_var.set(value)
                self.progress_text.set(text)
            except Exception:
                pass
        
        self.root.after(0, _update)
    
    def _execute_install(self):
        """执行安装"""
        # ====== 在主线程中收集所有 widget 值（Tkinter 不是线程安全的） ======
        try:
            install_dir = self.install_dir_entry.get().strip() or DEFAULT_INSTALL_DIR
        except Exception:
            install_dir = DEFAULT_INSTALL_DIR
        
        try:
            class_name = self.class_entry.get().strip() if hasattr(self, 'class_entry') else self.class_name
        except Exception:
            class_name = self.class_name
        
        try:
            create_desktop_bat = self.bat_var.get() if hasattr(self, 'bat_var') else True
        except Exception:
            create_desktop_bat = True
        
        try:
            file_types = [ext for ext, var in self.file_type_vars.items() if var.get()]
        except Exception:
            file_types = [".pdf", ".docx", ".doc"]
        
        try:
            data_dir = self.data_dir_entry.get().strip() if hasattr(self, 'data_dir_entry') else os.path.join(install_dir, "data")
        except Exception:
            data_dir = os.path.join(install_dir, "data")
        # 当前后端固定使用安装目录下的 data/，这里强制对齐，避免写到无效的外部 data_dir。
        data_dir = os.path.join(install_dir, "data")
        
        # 同步 scan_dirs
        try:
            if hasattr(self, '_scan_dir_vars'):
                scan_dirs = [v.get().strip() for v in self._scan_dir_vars if v.get().strip()]
            else:
                scan_dirs = list(self.scan_dirs) if self.scan_dirs else []
        except Exception:
            scan_dirs = []
        for default_dir in self._default_scan_dirs(install_dir, class_name):
            if default_dir not in scan_dirs:
                scan_dirs.append(default_dir)
        
        subjects = dict(self.subjects) if self.subjects else {}
        python_ok = self.python_ok
        
        # 先显示开始日志
        self._log("安装准备就绪，开始执行...", "INFO")
        self._set_progress(2, "准备中...")
        
        # 启动后台线程
        def install_thread():
            self._do_install(install_dir, class_name, create_desktop_bat, file_types, data_dir, scan_dirs, subjects, python_ok)
        
        threading.Thread(target=install_thread, daemon=True).start()
    
    def _do_install(self, install_dir, class_name, create_desktop_bat, file_types, data_dir, scan_dirs, subjects, python_ok):
        """在后台线程中执行实际安装操作"""
        journal = None
        try:
            install_dir = self._ensure_safe_install_dir(install_dir)
            data_dir = os.path.join(install_dir, "data")
            scan_dirs = [os.path.abspath(d) for d in scan_dirs if d]
            journal = self._new_install_journal()
            total_steps = 5
            if not python_ok:
                total_steps = 6
            
            # ====== 步骤1: 创建目录 ======
            self._set_progress(5, "正在创建安装目录...")
            self._log("创建安装目录...")
            
            self._remember_dir(journal, install_dir)
            self._remember_dir(journal, data_dir)
            class_folder = os.path.join(os.path.expanduser("~"), "Desktop", class_name)
            organized_dir = os.path.join(class_folder, "已收作业")
            experiment_dir = os.path.join(class_folder, "实验")
            self._remember_dir(journal, class_folder)
            self._remember_dir(journal, organized_dir)
            self._remember_dir(journal, experiment_dir)
            
            # 创建扫描目录
            for d in scan_dirs:
                self._remember_dir(journal, d)
            
            self._log(f"安装目录: {install_dir}", "SUCCESS")
            self._log(f"数据目录: {data_dir}", "SUCCESS")
            self._log(f"已收作业目录: {organized_dir}", "SUCCESS")
            self._log(f"公示/作业目录: {experiment_dir}", "SUCCESS")
            for d in scan_dirs:
                self._log(f"扫描目录: {d}", "SUCCESS")
            
            # ====== 步骤2: 下载Python（如果需要） ======
            step = 1
            if not python_ok:
                step = 2
                self._set_progress(20, "正在下载嵌入版 Python...")
                self._log("检测到未安装 Python，正在下载嵌入版...")
                
                python_dir = os.path.join(install_dir, "python")
                self._remember_dir(journal, python_dir)
                
                zip_path = os.path.join(tempfile.gettempdir(), "python-embed.zip")
                
                try:
                    self._log(f"从 {PYTHON_EMBED_URL} 下载...")
                    
                    def report_progress(block_num, block_size, total_size):
                        if total_size > 0:
                            downloaded = block_num * block_size
                            percent = min(int(downloaded * 100 / total_size), 100)
                            self._set_progress(20 + percent * 10 // 100, f"下载 Python... {percent}%")
                    
                    urllib.request.urlretrieve(PYTHON_EMBED_URL, zip_path, report_progress)
                    self._log("下载完成", "SUCCESS")
                    
                    # 解压
                    self._set_progress(35, "正在解压 Python...")
                    self._log("解压 Python 嵌入版...")
                    with zipfile.ZipFile(zip_path, "r") as zf:
                        zf.extractall(python_dir)
                    self._log("Python 嵌入版安装完成", "SUCCESS")
                    
                    # 清理
                    os.remove(zip_path)
                    
                except urllib.error.URLError as e:
                    self._log(f"下载 Python 失败: {e}", "ERROR")
                    self._log("请手动安装 Python 3.8+ 后重试", "WARN")
                    self._log("下载地址: https://www.python.org/downloads/", "WARN")
                    self._log("正在回滚安装...", "WARN")
                    self._rollback(install_dir, journal)
                    self.root.after(0, lambda: self._install_failed(
                        "Python 下载失败",
                        f"无法从 {PYTHON_EMBED_URL} 下载\n\n请检查网络连接或手动安装 Python 3.8+\n下载地址: https://www.python.org/downloads/"
                    ))
                    return
                except Exception as e:
                    self._log(f"安装 Python 失败: {e}", "ERROR")
                    self._log("正在回滚安装...", "WARN")
                    self._rollback(install_dir, journal)
                    self.root.after(0, lambda: self._install_failed(
                        "Python 安装失败",
                        f"解压或安装 Python 时出错: {str(e)}\n\n请手动安装 Python 3.8+"
                    ))
                    return
            
            # ====== 步骤3: 写入配置 ======
            step += 1
            progress_pct = step * 100 // total_steps
            self._set_progress(progress_pct - 5, "正在写入配置文件...")
            self._log("生成配置文件...")
            
            config = {
                "class_name": class_name,
                "class_folder": class_folder,
                "organized_dir": organized_dir,
                "experiment_dir": experiment_dir,
                "wechat_accounts": [],
                "watch_enabled": True,
                "auto_organize": True,
                "assignments": [],
                "scan_dirs": scan_dirs,
                "data_dir": data_dir,
                "file_types": file_types,
                "file_keywords": ["作业", "报告", "论文", "实验", "习题", "课设"],
                "subject_keywords": subjects,
                "port": APP_PORT,
                "auto_scan_interval": 30,
                "poll_interval": 5,
                "templates": [],
                "ignored_subjects": [],
                "version": APP_VERSION
            }
            
            config_path = os.path.join(data_dir, "config.json")
            self._write_json_file(journal, config_path, config)
            students_path = os.path.join(data_dir, "students.json")
            submissions_path = os.path.join(data_dir, "submissions.json")
            watcher_state_path = os.path.join(data_dir, "watcher_state.json")
            if not os.path.exists(students_path):
                self._write_json_file(journal, students_path, [])
            if not os.path.exists(submissions_path):
                self._write_json_file(journal, submissions_path, {})
            if not os.path.exists(watcher_state_path):
                self._write_json_file(journal, watcher_state_path, {"known_files": {}})
            
            self._log("配置文件已生成: data/config.json", "SUCCESS")
            
            # ====== 步骤4: 复制文件 ======
            step += 1
            progress_pct = step * 100 // total_steps
            self._set_progress(progress_pct - 5, "正在复制程序文件...")
            self._log("复制程序文件...")
            
            for fname in INSTALL_FILES:
                src = get_resource_path(fname)
                dst = os.path.join(install_dir, fname)
                if os.path.exists(src):
                    self._copy_install_file(journal, src, dst)
                    self._log(f"  ✓ {fname}", "SUCCESS")
                else:
                    self._log(f"  ! {fname} 源文件未找到，跳过", "WARN")
            
            # ====== 步骤5: 创建BAT脚本 ======
            step += 1
            progress_pct = step * 100 // total_steps
            self._set_progress(progress_pct - 5, "正在创建启动脚本...")
            
            def make_bat_content(cd_dir, python_cmd):
                return (
                '@echo off\r\n'
                'setlocal EnableExtensions\r\n'
                'chcp 65001 >nul\r\n'
                f'title Assignment Dashboard - By {AUTHOR}\r\n'
                f'cd /d "{cd_dir}"\r\n'
                f'set "PORT={APP_PORT}"\r\n'
                f'set "PREFERRED_PYTHON={python_cmd}"\r\n'
                'set "PYTHON_CMD="\r\n'
                'set "PYTHON_ARGS=-B -u"\r\n'
                'if exist "%PREFERRED_PYTHON%" goto use_preferred_python\r\n'
                'goto find_py_launcher\r\n'
                '\r\n'
                ':use_preferred_python\r\n'
                'set "PYTHON_CMD=%PREFERRED_PYTHON%"\r\n'
                'goto python_ready\r\n'
                '\r\n'
                ':find_py_launcher\r\n'
                'where py >nul 2>nul\r\n'
                'if errorlevel 1 goto find_python_cmd\r\n'
                'set "PYTHON_CMD=py"\r\n'
                'set "PYTHON_ARGS=-3 -B -u"\r\n'
                'goto python_ready\r\n'
                '\r\n'
                ':find_python_cmd\r\n'
                'where python >nul 2>nul\r\n'
                'if errorlevel 1 goto python_missing\r\n'
                'set "PYTHON_CMD=python"\r\n'
                'goto python_ready\r\n'
                '\r\n'
                ':python_ready\r\n'
                'echo ============================================\r\n'
                'echo    Assignment Dashboard\r\n'
                f'echo    By {AUTHOR}\r\n'
                'echo    URL: http://localhost:%PORT%\r\n'
                'echo ============================================\r\n'
                'echo.\r\n'
                'if not exist "server.py" goto server_missing\r\n'
                'if /I "%~1"=="--check" goto check_ok\r\n'
                'set /a restarts=0\r\n'
                '\r\n'
                ':loop\r\n'
                'echo Starting server with: %PYTHON_CMD% %PYTHON_ARGS%\r\n'
                'echo Press Ctrl+C to stop.\r\n'
                'echo.\r\n'
                '"%PYTHON_CMD%" %PYTHON_ARGS% server.py\r\n'
                'set "EXIT_CODE=%ERRORLEVEL%"\r\n'
                'if "%EXIT_CODE%"=="0" goto normal_exit\r\n'
                'set /a restarts+=1\r\n'
                'echo.\r\n'
                'echo ============================================\r\n'
                'echo Server exited. Exit code: %EXIT_CODE%\r\n'
                'echo Restarting in 5 seconds... Attempt %restarts%\r\n'
                'echo Press Ctrl+C to quit completely.\r\n'
                'echo ============================================\r\n'
                'timeout /t 5 /nobreak >nul\r\n'
                'if %restarts% GEQ 3 goto offer_repair\r\n'
                'goto loop\r\n'
                '\r\n'
                ':offer_repair\r\n'
                'echo.\r\n'
                'echo ============================================\r\n'
                'echo Server failed to start several times.\r\n'
                'echo If you have an update package, use the offline repair tool.\r\n'
                'echo ============================================\r\n'
                'echo.\r\n'
                'if not exist "repair_update.bat" goto repair_missing\r\n'
                'choice /C YN /M "Open offline update repair tool now"\r\n'
                'if errorlevel 2 goto loop\r\n'
                'call "repair_update.bat"\r\n'
                'exit /b %ERRORLEVEL%\r\n'
                '\r\n'
                ':normal_exit\r\n'
                'echo.\r\n'
                'echo ============================================\r\n'
                'echo Server is already running or stopped normally.\r\n'
                'echo Open: http://localhost:%PORT%\r\n'
                'echo No restart is needed.\r\n'
                'echo ============================================\r\n'
                'echo.\r\n'
                'pause\r\n'
                'exit /b 0\r\n'
                '\r\n'
                ':check_ok\r\n'
                'echo Startup script check OK.\r\n'
                'exit /b 0\r\n'
                '\r\n'
                ':server_missing\r\n'
                'echo [ERROR] server.py was not found in:\r\n'
                'echo %CD%\r\n'
                'echo.\r\n'
                'pause\r\n'
                'exit /b 1\r\n'
                '\r\n'
                ':python_missing\r\n'
                'echo [ERROR] Python was not found.\r\n'
                'echo Install Python 3.8+ or put embedded Python in .\\python\\python.exe\r\n'
                'echo.\r\n'
                'pause\r\n'
                'exit /b 1\r\n'
                '\r\n'
                ':repair_missing\r\n'
                'echo [WARN] repair_update.bat was not found.\r\n'
                'echo Please ask the administrator for a full installer or repair package.\r\n'
                'echo.\r\n'
                'pause\r\n'
                'goto loop\r\n'
                )

            install_python_cmd = 'python'
            desktop_python_cmd = 'python'
            embedded_python = os.path.join(install_dir, "python", "python.exe")
            if os.path.exists(embedded_python):
                install_python_cmd = "%~dp0python\\python.exe"
                desktop_python_cmd = embedded_python

            bat_content = make_bat_content("%~dp0", install_python_cmd)
            
            bat_path = os.path.join(install_dir, "启动作业追踪器.bat")
            self._write_text_file(journal, bat_path, bat_content)
            self._log("启动脚本已创建", "SUCCESS")
            
            # 桌面BAT
            if create_desktop_bat:
                desktop = os.path.join(os.path.expanduser("~"), "Desktop")
                desktop_bat = os.path.join(desktop, "启动作业追踪器.bat")
                try:
                    desktop_bat_content = make_bat_content(install_dir, desktop_python_cmd)
                    self._write_text_file(journal, desktop_bat, desktop_bat_content)
                    self._log(f"桌面快捷方式已创建: {desktop_bat}", "SUCCESS")
                except Exception as e:
                    self._log(f"桌面快捷方式创建失败: {e}", "WARN")
                    self._log("请手动将安装目录中的「启动作业追踪器.bat」复制到桌面", "WARN")
            
            # ====== 完成 ======
            self._set_progress(100, "安装完成！")
            self._log("=" * 40, "INFO")
            self._log("安装完成！", "SUCCESS")
            self._log(f"服务地址: http://localhost:{APP_PORT}", "SUCCESS")
            self._log(f"班级: {class_name}", "SUCCESS")
            self._log(f"扫描目录: {len(scan_dirs)} 个", "SUCCESS")
            self._log(f"科目: {len(subjects)} 个", "SUCCESS")
            self._log(f"文件类型: {len(file_types)} 种", "SUCCESS")
            self._log("=" * 40, "INFO")
            self._log("双击「启动作业追踪器.bat」启动服务", "INFO")
            
            # 启用完成按钮
            self.root.after(0, lambda: self.btn_next.configure(state=tk.NORMAL, text="完成 ✓"))
            self._cleanup_install_journal(journal)
            
        except Exception as e:
            tb = traceback.format_exc()
            self._log(f"安装过程发生异常: {e}", "ERROR")
            self._log(tb, "ERROR")
            
            # 回滚
            self._log("正在回滚安装...", "WARN")
            self._rollback(install_dir, journal)
            
            self.root.after(0, lambda: self._install_failed(
                "安装失败",
                f"安装过程发生错误:\n\n{str(e)}\n\n系统已自动回滚，请检查后重试。"
            ))
    
    def _rollback(self, install_dir=None, journal=None):
        """回滚安装，只恢复/删除本次安装记录过的文件和目录。"""
        if install_dir is None:
            install_dir = getattr(self, 'install_dir', None)
            if not install_dir:
                return
        try:
            if not journal:
                self._log("没有可用的安装记录，已跳过自动删除以保护已有文件。", "WARN")
                return

            for path, info in reversed(list(journal.get("files", {}).items())):
                try:
                    if info.get("existed"):
                        backup = info.get("backup")
                        if backup and os.path.exists(backup):
                            shutil.copy2(backup, path)
                            self._log(f"已恢复文件: {path}")
                    elif os.path.exists(path):
                        os.remove(path)
                        self._log(f"已删除本次新建文件: {path}")
                except Exception as e:
                    self._log(f"回滚文件失败 {path}: {e}", "ERROR")

            for path in reversed(journal.get("created_dirs", [])):
                try:
                    if os.path.isdir(path) and not os.listdir(path):
                        os.rmdir(path)
                        self._log(f"已删除本次新建空目录: {path}")
                except Exception as e:
                    self._log(f"回滚目录失败 {path}: {e}", "WARN")
            
            self._log("回滚完成", "SUCCESS")
        except Exception as e:
            self._log(f"回滚失败: {e}", "ERROR")
            self._log("请手动检查安装目录和桌面快捷方式", "WARN")
        finally:
            self._cleanup_install_journal(journal)
    
    def _install_failed(self, title, message):
        """安装失败弹窗"""
        full_msg = f"{message}\n\n如问题持续，请前往 GitHub Issues 反馈：\n{SUPPORT_URL}"
        messagebox.showerror(title, full_msg, parent=self.root)
    
    def run(self):
        """启动向导"""
        self.root.mainloop()


# ============================================================
# 主入口
# ============================================================

def main():
    wizard = InstallerWizard()
    wizard.run()
    print("安装向导已退出")


if __name__ == "__main__":
    main()
