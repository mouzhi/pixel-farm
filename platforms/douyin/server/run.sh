#!/bin/sh
set -e

# 加载bashrc中的环境变量
if [ -f $HOME/.bashrc ]; then
  source $HOME/.bashrc
fi

export NJS_SERVER_PORT=8000

# 初始化数据库（仅当存在 sql 目录时）
if [ -d sql ]; then
  node scripts/init-mysql-db.js
fi

# 启动服务
node dist/main