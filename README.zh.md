# 窗口置顶 —— DeepSeek Harness 插件

给 DeepSeek Harness（DSH）桌面版加一个**窗口标题栏上的置顶按钮**：位置紧挨着 Windows 原生"最小化"左边，点一下让窗口保持在其他窗口之上，再点一下取消。

```
┌──────────────────────────────────────────────────────────────┐
│  应用  编辑                                  📌  ─   □   ✕     │
└──────────────────────────────────────────────────────────────┘
                                              ↑ 置顶按钮在这里，
                                                右边是原生窗口按钮
```

[English](README.md) | 中文

## 为什么需要一个 Host 半边

DSH 桌面壳用 40px 一条 Windows 标题栏覆盖在页面之上（`titleBarStyle: hidden` + `titleBarOverlay`），最小化 / 最大化 / 关闭由 Windows 原生绘制。页面侧因此没有任何"置顶"接口：桌面预加载只暴露了文件、浏览器、快捷键、更新这些能力，没有改窗口层级的调用。

于是拆成两半：

| 半边 | 文件 | 职责 |
| --- | --- | --- |
| Client | `client.js` | 在 `shell.overlay` 槽注册一个入口，定位到原生按钮左侧，渲染图钉按钮。 |
| Host | `index.js` | 在 `ctx.webServer` 上提供 `GET /dsh-window-pin-on-top`，对承载页面的原生窗口调用 `user32!SetWindowPos(HWND_TOPMOST / HWND_NOTOPMOST)`。 |

运行时链路：点击 → `fetch('/dsh-window-pin-on-top?action=toggle&title=…')` → Host 按 `document.title` 找到顶层窗口（找不到时用进程父 PID 兜底），读取并翻转 `WS_EX_TOPMOST`，返回 `{ ok, topmost, hwnd }` → 按钮切换到置顶样式。

## 环境要求

- **Windows** 上的 DSH **桌面版**（页面带有桌面预加载写入的 `html[data-windows-titlebar]` 标记时按钮才渲染）。
- 在 DSH `0.2.2-rc.1` 上开发并测试。
- 无需构建：`index.js`、`client.js` 都是纯 ESM/JS。
- 系统自带 Windows PowerShell 5.1，用来做一次原生调用。

## 安装

把仓库克隆到任意目录，然后把这个目录作为 bundle 安装。

```powershell
git clone https://github.com/QIQI-hub-eng/dsh-window-pin-on-top-deepseek-.git
```

**让 Agent 装** —— 直接对 DSH 说：

> 安装 `D:\path\to\dsh-window-pin-on-top` 这个插件 bundle。

**在界面里装** —— 打开侧栏 **插件** 页，在安装入口填目录路径（或仓库地址），启用这个 bundle。

然后 **重启 DeepSeek Harness**。新加的 bundle 在启动时才会组合进 profile，安装结果会是 `restart-required`；重启后图钉就出现了。

目录安装是链接形式，改完文件重启即可生效，不需要重新打包。

## 使用

- 点图钉 = 窗口置顶；再点 = 取消。
- 点击有回应：置顶时图钉向下"按下、钉住"，取消时向上抬起再落回，同时有一层品牌色的柔光扩散确认状态；按钮按下时整体轻微缩小。系统开启"减少动态效果"（`prefers-reduced-motion: reduce`）时这些动画自动关闭。
- 置顶时图标变成主题的品牌色并带浅色底；悬停有提示，跟随界面语言（中文 / English）。
- 挂载时会向 Host 查询真实窗口状态，所以不会出现"界面显示已置顶、实际没有"的情况。

## 一些实现细节

- **定位**来自 Window Controls Overlay 几何（`navigator.windowControlsOverlay.getTitlebarAreaRect()`）加 8px 间距；拿不到几何时按三个标准窗口按钮 138px 兜底。标题栏高 40px，按钮 28px，和壳自己的标题栏控件一致。
- **拖拽与点击**：那条 40px 带子是 `-webkit-app-region: drag` 区域，按钮声明 `no-drag` 并阻止指针冒泡，否则点击会被当成拖窗口吞掉。
- **路由拒绝陌生调用方**：必须带 `x-dsh-window-pin: 1` 请求头（跨站页面无法在不触发预检的情况下带上它），且只接受 `GET` + `action=state|on|off|toggle`。
- **失败即隐藏**：Host 找不到窗口时返回 `{ ok: false, error: 'window-not-found' }`，按钮就不渲染，而不是留一个点了没反应的死按钮。
- **开销**：每次操作起一个短命的 PowerShell 子进程（实测约 250ms），因为这是 Host 侧不装原生扩展就能碰到 `user32` 的唯一办法。

## 已知限制

- 只支持 Windows。macOS 的红绿灯按钮在另一侧，控件不渲染。
- 置顶后会一直保持，直到再次点击或应用重启。
- 如果未来的 DSH 改了标题栏高度或覆盖层几何，需要调的只有 `client.js` 顶部的两个常量（`STRIP_HEIGHT`、`FALLBACK_CAPTION_WIDTH`）和 Host 路由。

## 许可证

MIT，见 [LICENSE](LICENSE)。
