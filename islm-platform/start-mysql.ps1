# 一键启动本地 MySQL（数据目录：项目内 .mysql-data，已 gitignore）
# 用法：在项目根目录打开 PowerShell 执行  .\start-mysql.ps1
# 或直接右键"使用 PowerShell 运行"
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$mysqld = 'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe'
$datadir = Join-Path $root '.mysql-data'

if (-not (Test-Path $datadir)) {
  Write-Host '[1/2] 首次运行：初始化数据目录（root 空密码）...'
  & $mysqld --no-defaults --initialize-insecure `
      --basedir='C:\Program Files\MySQL\MySQL Server 8.4' `
      --datadir="$datadir" --console
}

Write-Host '[2/2] 启动 MySQL（端口 3306，保持本窗口开启）...'
& $mysqld --no-defaults `
    --basedir='C:\Program Files\MySQL\MySQL Server 8.4' `
    --datadir="$datadir" --port=3306 --console `
    --log-error="$(Join-Path $datadir 'error.log')"
