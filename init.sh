#!/bin/sh -x

name=$(curl https://api.github.com/repos/mrs4s/go-cqhttp/releases/latest | grep -Eo '"go-cqhttp.+amd64.deb"' | grep -Eo 'go-cqhttp.+amd64.deb')
curl https://api.github.com/repos/mrs4s/go-cqhttp/releases/latest | grep -Eo 'https.+amd64.deb' | xargs wget
sudo apt install ./$name -y
rm $name
if [ ! -d "~/.go-cqhttp" ]; then
mkdir ~/.go-cqhttp
cd ~/.go-cqhttp
go-cqhttp
fi
read -p "编辑完配置文件后继续" name
npx pm2 start go-cqhttp --cwd ~/.go-cqhttp --no-daemon
