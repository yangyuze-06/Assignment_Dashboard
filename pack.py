#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
作业追踪器 - 更新打包脚本
维护者: Assignment_Dashboard 项目贡献者
将系统文件打包为更新ZIP包，支持纳入 announcement.json 和自定义文件列表
"""

import os
import sys
import json
import zipfile
import datetime
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BUGFIX_REQUIRED_FILES = (
    "server.py",
    "dashboard.html",
    "dashboard_modern.html",
    "static/classic.css",
    "static/classic.js",
    "static/modern.css",
    "static/modern.js",
)

# 打包配置
PACK_CONFIG = {
    "include_files": [
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
        "启动作业追踪器.bat",
        "更新修复工具.bat",
        "start.sh",
        "CHANGELOG.md",
        "manifest.json"
    ],
    "include_dirs": [],
    "exclude_patterns": [
        "__pycache__",
        "*.pyc",
        ".git",
        "*.zip",
        "releases",
        "data",
        "homework"
    ],
    "output_dir": "releases"
}


def get_version():
    """从 config.json 读取版本号"""
    config_path = os.path.join(BASE_DIR, "config.json")
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        return config.get("version", "1.0.0")
    except:
        return "1.0.0"


def check_announcement():
    """检查是否存在 announcement.json"""
    ann_path = os.path.join(BASE_DIR, "announcement.json")
    if os.path.exists(ann_path):
        try:
            with open(ann_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            count = len(data.get("announcements", []))
            return True, count
        except:
            pass
    return False, 0


def should_exclude(name, patterns):
    """检查文件/目录是否应被排除"""
    import fnmatch
    for pattern in patterns:
        if fnmatch.fnmatch(name, pattern):
            return True
    return False


def create_update_package(version=None, file_list=None, output_name=None):
    """
    创建更新ZIP包
    
    参数:
        version: 版本号（默认从 config.json 读取）
        file_list: 自定义文件列表（None 则使用默认 PACK_CONFIG）
        output_name: 自定义输出文件名（None 则自动生成）
    
    返回: zip_path
    """
    if version is None:
        version = get_version()
    
    if file_list is None:
        file_list = PACK_CONFIG["include_files"]
    
    # 输出目录
    output_dir = os.path.join(BASE_DIR, PACK_CONFIG["output_dir"])
    os.makedirs(output_dir, exist_ok=True)
    
    # 文件名
    if output_name:
        zip_name = output_name
        if not zip_name.endswith(".zip"):
            zip_name += ".zip"
    else:
        date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_name = f"homework_tracker_v{version}_{date_str}.zip"
    
    zip_path = os.path.join(output_dir, zip_name)
    
    print(f"[INFO] 开始打包 v{version} ...")
    print(f"[INFO] 输出路径: {zip_path}")
    
    files_added = 0
    excluded_count = 0
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # 添加指定文件
        for fname in file_list:
            if fname == "manifest.json":
                # 版本清单由本次打包参数生成，避免沿用旧清单。
                continue
            fpath = os.path.join(BASE_DIR, fname)
            
            # 检查排除规则
            if should_exclude(fname, PACK_CONFIG["exclude_patterns"]):
                print(f"  - {fname} (已排除)")
                excluded_count += 1
                continue
            
            if os.path.exists(fpath):
                if os.path.isfile(fpath):
                    zf.write(fpath, fname)
                    size_kb = os.path.getsize(fpath) / 1024
                    print(f"  + {fname} ({size_kb:.1f} KB)")
                    files_added += 1
                elif os.path.isdir(fpath):
                    # 添加目录中的所有文件
                    for root, dirs, files in os.walk(fpath):
                        # 排除子目录
                        dirs[:] = [d for d in dirs if not should_exclude(d, PACK_CONFIG["exclude_patterns"])]
                        for file in files:
                            if should_exclude(file, PACK_CONFIG["exclude_patterns"]):
                                continue
                            file_path = os.path.join(root, file)
                            arcname = os.path.relpath(file_path, BASE_DIR)
                            zf.write(file_path, arcname)
                            size_kb = os.path.getsize(file_path) / 1024
                            print(f"  + {arcname} ({size_kb:.1f} KB)")
                            files_added += 1
            else:
                print(f"  ! {fname} 不存在，跳过")
        
        # 添加公告文件（如果存在）
        ann_path = os.path.join(BASE_DIR, "announcement.json")
        if os.path.exists(ann_path):
            if not should_exclude("announcement.json", PACK_CONFIG["exclude_patterns"]):
                zf.write(ann_path, "announcement.json")
                size_kb = os.path.getsize(ann_path) / 1024
                print(f"  + announcement.json ({size_kb:.1f} KB) - 公告文件")
                files_added += 1
        else:
            print(f"  ! announcement.json 不存在，跳过（可选）")

        manifest = {
            "app": "Assignment_Dashboard",
            "version": str(version),
            "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
            "files": [name for name in file_list if name != "manifest.json"],
            "has_announcement": os.path.exists(ann_path),
        }
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"))
    
    # 文件大小
    size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    
    print(f"\n[SUCCESS] 打包完成！")
    print(f"  文件: {zip_name}")
    print(f"  大小: {size_mb:.2f} MB")
    print(f"  包含: {files_added} 个文件")
    if excluded_count > 0:
        print(f"  排除: {excluded_count} 个文件")
    
    # 检查公告
    has_ann, ann_count = check_announcement()
    if has_ann:
        print(f"  公告: {ann_count} 条公告已包含")
    else:
        print(f"  提示: 未找到 announcement.json，如需发布公告请先创建")
    
    return zip_path


def create_bugfix_package(fix_files, version=None):
    """
    创建Bug修复更新包（修复文件 + 更新器必需文件）
    
    参数:
        fix_files: 修复的文件列表，如 ["server.py", "dashboard.html"]
        version: 版本号
    
    返回: zip_path
    """
    if version is None:
        version = get_version()
    
    date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    output_name = f"homework_tracker_bugfix_v{version}_{date_str}.zip"
    
    print(f"[INFO] 创建Bug修复更新包...")
    print(f"[INFO] 修复文件: {fix_files}")

    package_files = list(dict.fromkeys([*BUGFIX_REQUIRED_FILES, *fix_files]))
    return create_update_package(version, file_list=package_files, output_name=output_name)


def list_available_files():
    """列出所有可打包的文件"""
    print("\n可打包的文件列表:")
    print("-" * 40)
    
    for fname in PACK_CONFIG["include_files"]:
        fpath = os.path.join(BASE_DIR, fname)
        status = "OK" if os.path.exists(fpath) else "MISSING"
        size = ""
        if os.path.isfile(fpath):
            size = f" ({os.path.getsize(fpath) / 1024:.1f} KB)"
        print(f"  [{status}] {fname}{size}")
    
    ann_path = os.path.join(BASE_DIR, "announcement.json")
    if os.path.exists(ann_path):
        print(f"  [OK] announcement.json ({os.path.getsize(ann_path) / 1024:.1f} KB) - 公告")
    else:
        print(f"  [ ] announcement.json - 未创建")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="作业追踪器更新包打包工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  python pack.py                           # 默认打包所有文件
  python pack.py --version 2.0.0           # 指定版本号
  python pack.py --list                    # 列出可打包文件
  python pack.py --bugfix server.py dashboard.html  # 创建Bug修复包
  python pack.py --files server.py config.json       # 打包指定文件
  python pack.py --output my_update.zip    # 自定义输出文件名
        """
    )
    parser.add_argument("--version", "-v", help="指定版本号（默认从config.json读取）")
    parser.add_argument("--output", "-o", help="自定义输出文件名")
    parser.add_argument("--list", "-l", action="store_true", help="列出所有可打包文件")
    parser.add_argument("--bugfix", "-b", nargs="+", metavar="FILE", help="创建Bug修复包（自动补齐更新必需文件）")
    parser.add_argument("--files", "-f", nargs="+", metavar="FILE", help="只打包指定文件")
    parser.add_argument("--dir", "-d", help="输出目录")
    
    args = parser.parse_args()
    
    if args.dir:
        PACK_CONFIG["output_dir"] = args.dir
    
    if args.list:
        list_available_files()
        return
    
    try:
        if args.bugfix:
            create_bugfix_package(args.bugfix, args.version)
        elif args.files:
            output_name = args.output
            create_update_package(args.version, file_list=args.files, output_name=output_name)
        else:
            output_name = args.output
            create_update_package(args.version, output_name=output_name)
    except Exception as e:
        print(f"[ERROR] 打包失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
