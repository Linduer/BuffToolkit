# BuffToolkit（CS 炼金工具箱）

围绕 **CS2 汰换合同（炼金）** 的桌面工具：实时拉取 BUFF 价格、按利润率筛选配方、维护 Excel 台账、材料到价邮件提醒、库存同步与缺料分析、配料寻优。所有功能都在**本地浏览器界面**里操作，双击 `BuffToolkit.exe` 即可使用。

**定位与发展方向**：目标是把炼金做成**除了买料和卖产物，其余全自动**——找配方、算期望、盯价格、验磨损、管库存、提醒买料时机这些环节，软件替你跑；你只需要在下单平台按提醒买料、炼成后卖出产物。作者自用版本已按这个方向跑通全流程，发行版会持续跟进，**想了解当前最新能力或定制需求，联系作者（QQ 916182191）询问**。

### 功能一览

| 环节 | 能力 |
|---|---|
| 找配方 | 实时拉价按利润率筛配方，勾选直接写进台账；配料寻优算"这一炉怎么配最划算" |
| 算期望 | 期望计算、期望校验（实时期望 vs 台账，跌破阈值预警） |
| 盯价格 | 材料到价邮件提醒（BUFF/悠悠，阈值/间隔/时刻表/按账户分发）、主材料调价后副材料价自动对齐 |
| 管库存 | BUFF/Steam 库存同步、离线检索、缺料分析、材料核对、持仓账本、库存导出 |
| 开炉 | 配料寻优（这炉怎么配）+ 主材料调价（主价改了重算副价）+ **自动开炉 Beta**（按炉单连 Steam GC 真开炉：预演→确认→执行前重校验，三道闸防误开） |
| 台账 | Excel 台账原子写（占用检查/备份/回读校验）、一个 sheet 一个账户 |

当前版本：**v2.1**（见 [VERSION](VERSION)，更新日志见文末）

## 下载

程序本体（免安装，Windows 64 位）请到 [**Releases**](https://github.com/Linduer/BuffToolkit/releases) 下载最新版的 `BuffToolkit-v*-win64.zip`，解压后双击 `BuffToolkit.exe` 使用。

> 本仓库只存放说明文档、界面源码与配置模板；完整程序（exe + 运行时）体积较大，统一放在 Releases。

## 联系与免费试用

- **联系作者**：QQ **916182191**，可以联系作者**免费试用**
- 也可以直接用下面的公开试用密钥（先到先得）：

<details>
<summary><b>公开试用密钥（2026-12-07 到期 · 每月 30 次炼金期望计算）</b></summary>

```
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTAxIiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy02Zjk4IiwidiI6MX0.UokvUtR0P0Wo-rlY2h6dwEBocEBuw7qFpdPkxsVCPxcSUIyPSixXfX6aJZbXGkYRi0DclVD0RP71jss5pOxNCA
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTAyIiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1jYTkxIiwidiI6MX0.slfBA-FQ0b531ORmQSo5mG6dh0shGY9qU3ZayxDj63r-2JXXC1sYyJzL07AR_M2FWopmj1uOTrGlxEODW-qlBg
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTAzIiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy0wZWNkIiwidiI6MX0.nJZCt8uxm5XP7qBOPD47a7HeZXnhgUdFsY8XTcL2vh7cvnScNquRSxfowaCPBvAS5ozWbrzcYcFQgZqxx4cvCg
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTA0IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1iZTQ2IiwidiI6MX0.j8odXbrbYersMEdS9SJqLXR9mFhUiphJDQMAqFUhQtzfqik5r3x1Iz0XwCugfEJzfpdm-uVMw-ZFjF53maVGBA
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTA1IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy0yZTBlIiwidiI6MX0.xH9je6_A3ovfagfQ0pUi53tnV3_RPUEoRLuCgTESv7RwK4ga3tm9HYMAPz1SY9awLyddgugQIVHjRX_AduvzBQ
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTA2IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy0yNGUzIiwidiI6MX0.hwRXBjvFwQ7qI2i_uqNzpKi787D7cRenpgzS9RWdk7RfotctGJdeHZdgSFNnV0Q13mULj0zl2FZRhh4kcouCBg
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTA3IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy01YTU1IiwidiI6MX0.QWO0VTmzJSPp99Xa0-xfbi786S8eLlqDASyLs_B-WvtFnKTjs05rVOBdvbRcmVgkse4emD48EKQzDLfFjD5GAw
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTA4IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy0xNjdiIiwidiI6MX0.fMaYRUvIRSyPmttyppvv6Dp2Xrs33mAXhZ5CtKEB0ydiRIpyCYrhBSPo5kH8bJYttxeM_I_rT4I9b2gQrzvKAw
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTA5IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy03MTliIiwidiI6MX0.o6BXmNyTpIfDW_RCUks-dUOfAxcvY1JvLKgH43M_oTI9EUVa4vQOckZLXjZRXsv3H1ubmxBHu8w6dSQqrY27Ag
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTEwIiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1jNTgxIiwidiI6MX0.H5wCB-qoQ1p0jpzclGuKT6wGRwCyf9j8TysZDekODlYYxRKOtj9X4VV5zQXtLROgmSaIYrnmXIT4fPb6MLaqAw
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTExIiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1mMmZkIiwidiI6MX0.ZzHcjIQFSqy1q_yU5JBcxbCd-edIhvPmLnNiVREH4Lm5sTrqj7NwfAz64_1CFShrpsRX-7t9NiIw0N59-9CNAQ
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTEyIiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1jYzVjIiwidiI6MX0.P0EMojT_oxymjVtuCG1s7DYXovHkHlslTuhPpqZRmh99m6b1J1UwXqA9eXnHa1SKcPbe4fqaN2rf0KimJh1gCA
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTEzIiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1jYTQ5IiwidiI6MX0.1Hechyr46za3N5Ub2yJ4sAs8SvQ5-iVZFcjEl1bgqluBnMI0K9pHVC2OtZJHZfVhhv3ygeFqeJNYdq2x8kCcCg
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTE0IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1jZWQxIiwidiI6MX0.sIQepBjwp2oYxtYnHUAMKbXxiuz6UKhZuqZqGptO-U_p3mQMSJs6YJTIT0EWqxev3jgqZlIcU38aEOPXd5NqBw
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTE1IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy0wZDhkIiwidiI6MX0._hw7cAj9SWg68UFAxXAip-9nao96wQuLxw4F_roZGL1DeNGx1WgrBgxhtrnf7EtU9uJyIgS6baC7CeZLd4E0BQ
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTE2IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1mMGViIiwidiI6MX0.Qa9JtbEcHxSMGuwP7TwmVJ1sUpbW5qtFxs_aSS8FB2k9A18hbuZNmwHBEFdo_9cGPCLxbQbyLrbAwoq97d4OBA
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTE3IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1iZTY0IiwidiI6MX0.BMzBV2-dbXGVRsWaAdabQ8xkT_zn5-w10K_w7l2A5oLyQMjgfzv833igIoAdR2q1v6LzhxA0eD_G92MuKN5hDA
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTE4IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1kY2E1IiwidiI6MX0.x1hTGE0toJmqbuY9oNqc_SBAP6WgIu788wBhNDwqDzErfdIzd0_223b7z_jUTG0KzKDYzAQ1C1oHb3f2V6YiAA
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTE5IiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy1mN2QwIiwidiI6MX0.rFaiIyzfb7CrnOCKzDH4JgJffas8kWOij1NvS1tWI7L5CN-h_WAgYFgEUxu98iwjmmQt_Udj6Vu-LfGhfoVGCg
BT-eyJleHAiOjE3OTY2NTkxOTksImhvbGQiOiLlhazlvIDor5XnlKgxMi43LTIwIiwiaWF0IjoxNzkzOTgxODU0LCJxdW90YSI6MzAsInNuIjoiMTEwNy02ZWJhIiwidiI6MX0.7ammcThaDS0is2pPb0fb8J_SRbwgOQmUmBHgWQIHbvt5nly1nb3xSvfnH9aVi5BrW01NguAvWdpqtiX-JqjhDw
```

> 密钥含 `BT-` 前缀整段复制；到期后请加 QQ 联系作者获取新密钥。滥用或倒卖的密钥会被线上吊销。

</details>

## 快速开始（四步走）

1. **激活订阅**：订阅管理页粘贴 `BT-` 开头的密钥 →「激活 / 更换密钥」
2. **添加账户**：配置管理页添加 BUFF 账户，按提示粘贴浏览器 F12 复制的 Cookie
3. **配置邮箱**（需要收邮件才做）：配置管理 → 邮箱配置
4. **填台账**：用 `实时炼金配方_模板.xlsx` 建立自己的配方台账

详细的图文说明见 [BuffToolkit说明.md](BuffToolkit说明.md)（同目录有网页版 `BuffToolkit说明.html`）。

## 仓库目录

```
BuffToolkit说明.md / .html   # 完整使用说明（推荐先看）
实时炼金配方_模板.xlsx         # 台账空模板
爬虫配置.json                 # 账户 / 邮箱 / 平台参数模板（占位符，填自己的 Cookie）
配方简称.json                 # 配方简称映射
收藏品编号固定.json            # 收藏品编号速查表
web/                         # 浏览器界面源码（纯静态 HTML/JS/CSS）
steam_probe/                 # Steam 库存探测脚本（含 配置.example.json 模板）
数据源/                       # ByMykel CS2-Api 皮肤与收藏品 JSON + 补充表
```

## 安全提示

- `爬虫配置.json`、`steam_probe/配置.json` 里会存放你的平台 Cookie / Steam 账号凭据，**只在本机使用，切勿公开上传或发给他人**（本仓库中的均为占位符模板）。
- 程序只在本机 `127.0.0.1` 起服务，外部访问不到。

## 常见问题

**CS2 炼金（汰换合同 / Trade-Up）是什么？**
把 10 把同稀有度的皮肤汰换成 1 把更高稀有度皮肤的游戏内机制。材料按收藏品与磨损区间选取，可以控制产物磨损，从而"炼"出高价值产物——是 CS2 饰品市场里一种常见的低买高卖玩法。

**BuffToolkit 和普通 CS2 炼金计算器有什么区别？**
普通计算器只能手填价格算单次；BuffToolkit 直连 BUFF 实时价格、自动按利润率筛选全部可炼配方、维护 Excel 台账、材料到价自动发邮件提醒、同步 Steam 库存做缺料分析、并对整炉材料做配料寻优。整个流程在本地浏览器界面完成。

**支持哪些交易平台？**
价格源：BUFF（网易 BUFF）。库存：Steam。界面与数据均为中文，适配国内饰品交易习惯。

**需要什么环境？**
Windows 64 位，免安装，解压即用。所有功能在本机 127.0.0.1 运行，不上传你的任何数据。

**怎么开始？**
见上方「快速开始」；首次使用可联系作者（QQ 916182191）免费试用，或直接使用页面上方的公开试用密钥。

## 更新日志

- **v2.2**（2026-11-07）：新增**自动开炉（Beta）**——消费配料寻优的炉单，直接连 Steam GC 执行汰换合同：令牌自动跟随炉单账户；预演→键入炉号确认→执行前重校验，三道闸防误开；开炉结果记入 `开炉记录_累计.json` 供对账。⚠️ 开炉不可逆，Steam 自动化属灰色地带，账号风险自担。
- **v2.1**（2026-11-07）：程序加固——期望计算、取价、磨损判定、台账读写等核心模块由字节码改为原生编译（.pyd），显著提高逆向门槛；修复多槽位配方枚举缺少 `product` 导入的潜在错误；台账模板更新收藏品编号对照表。
- **v2.0**（2026-11-06）：首个公开发布版本。
