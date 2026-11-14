#!/usr/bin/env bash
# 把站点切到自定义域名。用法：./tools/set-domain.sh douduotech.com
# 前置条件：域名的 A 记录已经指向 GitHub Pages 的 4 个 IP，否则会拒绝执行（避免站点打不开）。
set -euo pipefail
DOMAIN="${1:-douduotech.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IPS=(185.199.108.153 185.199.109.153 185.199.110.153 185.199.111.153)

echo "== 1/4 检查 DNS：$DOMAIN"
GOT=$(python3 - "$DOMAIN" <<'PY'
import socket,sys
try:
    print(" ".join(sorted(set(socket.gethostbyname_ex(sys.argv[1])[2]))))
except Exception:
    print("")
PY
)
if [ -z "$GOT" ]; then
  echo "✗ $DOMAIN 还解析不出来。先去阿里云云解析加 A 记录：${IPS[*]}"; exit 1
fi
echo "  解析到：$GOT"
MISS=0
for ip in "${IPS[@]}"; do echo "$GOT" | grep -q "$ip" || MISS=$((MISS+1)); done
if [ "$MISS" -gt 0 ]; then
  echo "⚠ 只匹配到 $((4-MISS))/4 个 GitHub IP。继续可能打不开，先确认 DNS 再跑。"
  read -r -p "仍然继续？(y/N) " ok; [ "$ok" = "y" ] || exit 1
fi

echo "== 2/4 写 CNAME"
printf '%s\n' "$DOMAIN" > "$ROOT/CNAME"

echo "== 3/4 改写站内绝对链接（旧 GitHub 地址 -> 新域名）"
grep -rl "zzehui.github.io/DouDuo" "$ROOT" --include='*.html' --include='*.md' --include='*.js' --include='*.webmanifest' 2>/dev/null | while read -r f; do
  sed -i "s#https://zzehui.github.io/DouDuo#https://$DOMAIN#g" "$f"
  echo "  改：${f#$ROOT/}"
done

echo "== 4/4 提交并推送"
cd "$ROOT"
git add -A
git -c user.email=zzhlmgj@163.com -c user.name=douduo commit -q -m "站点切到自定义域名 $DOMAIN（CNAME + 链接）" || echo "  （没有变化）"
git push -q origin main
echo
echo "✓ 已推送。接下来在 GitHub 仓库 Settings → Pages 勾上 Enforce HTTPS（证书签发通常 1-10 分钟）。"
echo "  验证：curl -sI https://$DOMAIN/ | head -1"
