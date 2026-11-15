# 域名迁移到 douduotech.com

## 现状

| 域名 | 状态 | 用途 |
|---|---|---|
| `douduotech.com` | 已注册（2027-11-14 到期，NS 指向阿里云 hichina） | **主站**（待切） |
| `douduotech.cn` | 已注册 | 暂不启用；以后做 301 跳转到 .com |
| `zzehui.github.io/DouDuo/` | 当前线上地址 | 切换后保留跳转（GitHub 自动） |

## 一次性操作（在阿里云 云解析 DNS）

给 `douduotech.com` 添加：

| 类型 | 主机记录 | 值 | TTL |
|---|---|---|---|
| A | `@` | `185.199.108.153` | 600 |
| A | `@` | `185.199.109.153` | 600 |
| A | `@` | `185.199.110.153` | 600 |
| A | `@` | `185.199.111.153` | 600 |
| CNAME | `www` | `zzehui.github.io` | 600 |

注意事项：
- 阿里云默认会给 `@` 加一条「parking」的 CNAME，**先删掉**，否则和 A 记录冲突。
- 不要在 `@` 上放 CNAME（apex 不允许）。
- 解析生效一般 10 分钟–2 小时。

## 然后运行（仓库根目录）

```bash
./tools/set-domain.sh douduotech.com
```

脚本会：校验 DNS 是否指向 GitHub → 写 `CNAME` → 把站内 `https://douduotech.com` 全部替换成 `https://douduotech.com` → 提交推送。
**DNS 没生效时脚本会拒绝执行**，避免站点打不开。

最后在 GitHub `Settings → Pages` 勾 **Enforce HTTPS**（证书 1–10 分钟签发）。

## 切换后还需同步的地方（脚本改不到的）

1. `knowledge/products/pdfpocket/store/listing.md` 的隐私政策 URL、支持页 URL
2. 扩展内 4 处：购买按钮、`welcome.js` 的英文手册链接、`app.html` 的 `?`、`welcome.html` 的手册链接
3. 爱发电商品说明里的「使用手册」链接
4. `docs/manual.md` 与手册 PDF 里的示例链接

## 验证清单

```bash
for u in / /products/ /about/ /legal/privacy/ /pdfpocket/ /pdfpocket/manual/ /pdfpocket/app/; do
  printf "%s %s\n" "$(curl -sL -o /dev/null -w '%{http_code}' https://douduotech.com$u)" "$u"
done
curl -sI https://www.douduotech.com/ | head -1   # 应 301 到 apex
```

## .cn 怎么处理（以后再说）

三种做法，按省事排序：
1. **不配**（推荐）：域名放着当保护，不解析。零成本、零风险。
2. 阿里云「URL 转发」到 `https://douduotech.com`：免费，但未备案的 .cn 可能被限制，需要试。
3. 把 NS 转到 Cloudflare，用 Redirect Rule 做 301：免费、稳，但要迁移 NS（影响 .cn 实名信息通知）。
