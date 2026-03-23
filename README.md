# Timeless Jewel Calculator (Preview Enhanced)

[![Deploy to GitHub Pages](https://github.com/hnzxmutex/timeless-jewels/actions/workflows/deploy.yml/badge.svg)](https://github.com/hnzxmutex/timeless-jewels/actions/workflows/deploy.yml)
[![GitHub license](https://img.shields.io/github/license/hnzxmutex/timeless-jewels)](https://github.com/hnzxmutex/timeless-jewels/blob/master/LICENSE)

一个用于 Path of Exile (POE) 的**永恒珠宝（Timeless Jewel）计算器**，带有天赋树可视化预览。本项目在原项目基础上增加了 **Chrome 扩展**，可在 POE 交易页面（国服 + 国际服）直接预览永恒珠宝效果。

## 🌐 在线使用

**在线计算器**：[https://hnzxmutex.github.io/timeless-jewels](https://hnzxmutex.github.io/timeless-jewels)

打开页面后：

1. 选择珠宝类型（Glorious Vanity / Lethal Pride / Brutal Restraint / Militant Faith / Elegant Hubris）
2. 选择征服者（Conqueror）
3. 输入种子编号（Seed）
4. 在天赋树上查看每个天赋点被珠宝影响后的效果

## 🧩 Chrome 扩展（POE 交易页预览）

本项目包含一个 Chrome 扩展，可以在 POE 交易网站（国服 `poe.game.qq.com` / 国际服 `pathofexile.com`）浏览永恒珠宝时，直接注入 **Preview** 按钮，点击即可通过 iframe 预览天赋树效果。

### 安装方法

1. 前往 [Releases](https://github.com/hnzxmutex/timeless-jewels/releases) 页面，下载最新的 `timeless-jewel-preview-vX.X.X.zip`
2. 解压到任意目录
3. 打开 Chrome 浏览器，进入 `chrome://extensions/`
4. 开启右上角的 **开发者模式**
5. 点击 **加载已解压的扩展程序**，选择解压后的目录
6. 前往 POE 交易页面搜索永恒珠宝，扩展会自动识别并注入 Preview 按钮

### 工作原理

- 通过 DOM 中的 `data-field` 属性（`stat.explicit.pseudo_timeless_jewel_{conqueror}`）自动识别永恒珠宝
- 从 `data-field` 提取征服者名称，从描述文本正则提取 seed
- 在物品描述区注入 Preview 按钮，点击后通过 iframe 加载天赋树计算器

## 📋 致谢与出处

> **本项目 Fork 自 [Vilsol/timeless-jewels](https://github.com/Vilsol/timeless-jewels)**
>
> 原作者：[Vilsol](https://github.com/Vilsol)
>
> 原项目在线版本：[https://vilsol.github.io/timeless-jewels](https://vilsol.github.io/timeless-jewels)
>
> 数据源：[Vilsol/go-pob-data](https://github.com/Vilsol/go-pob-data)

本项目在原项目基础上进行了以下修改：
- 增加 Chrome 扩展，支持在 POE 交易页面直接预览永恒珠宝效果
- 支持国服（`poe.game.qq.com`）交易页面
- 添加 GitHub Pages 自动部署工作流
- 新增第 6 种永恒珠宝 **Heroic Tragedy（英雄的悲剧）** 支持（POE 3.28 Kalguur），新增征服者 Vorana / Uhtred / Medved

---

<details>
<summary>English</summary>

A **Timeless Jewel Calculator** for Path of Exile (POE) with passive tree visualization preview. This fork adds a **Chrome extension** for previewing timeless jewel effects directly on POE trade pages (both Tencent and official servers).

### Online Calculator

**Live version**: [https://hnzxmutex.github.io/timeless-jewels](https://hnzxmutex.github.io/timeless-jewels)

Steps:
1. Select jewel type (Glorious Vanity / Lethal Pride / Brutal Restraint / Militant Faith / Elegant Hubris / **Heroic Tragedy**)
2. Select a conqueror
3. Enter seed number
4. View each affected passive node on the skill tree

### Chrome Extension (Trade Page Preview)

A Chrome extension is included to inject **Preview** buttons on POE trade websites (`poe.game.qq.com` / `pathofexile.com`) when browsing timeless jewels.

#### Installation

1. Download the latest `timeless-jewel-preview-vX.X.X.zip` from [Releases](https://github.com/hnzxmutex/timeless-jewels/releases)
2. Extract to any directory
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked** and select the extracted directory
6. Visit a POE trade page and search for timeless jewels — the extension will auto-detect and inject Preview buttons

### Changes from Original Fork

- Added Chrome extension for direct timeless jewel preview on POE trade pages
- Support for Chinese server (`poe.game.qq.com`) trade pages
- Added GitHub Pages auto-deploy workflow
- Added **Heroic Tragedy** (3.28 Kalguur) support — new conquerors: Vorana / Uhtred / Medved

### Credits

> **Forked from [Vilsol/timeless-jewels](https://github.com/Vilsol/timeless-jewels)**
>
> Original author: [Vilsol](https://github.com/Vilsol)
>
> Original live version: [https://vilsol.github.io/timeless-jewels](https://vilsol.github.io/timeless-jewels)
>
> Data source: [Vilsol/go-pob-data](https://github.com/Vilsol/go-pob-data)

### License

This project inherits the original project's [GNU General Public License v3.0](LICENSE).

</details>

## 📄 许可证

本项目继承原项目的 [GNU General Public License v3.0](LICENSE) 许可证。
