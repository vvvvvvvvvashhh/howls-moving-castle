# 放到 GitHub 上

## 1. 上传项目

先解压 `howls_moving_castle_github.zip`。把里面的 `howls-moving-castle` 文件夹作为仓库根目录：打开仓库时，应直接看见 `README.md`、`index.html`、`src/` 和 `blender/`。

创建一个自己的 GitHub 仓库，再上传这个目录里的文件。使用 Git 或 GitHub Desktop 时，随包 `.gitignore` 会排除音频、视频、个人 `.blend`、渲染帧和缓存；用网页手动上传时，请直接使用这个整理好的公共目录。

可参考以下仓库名称和简介，按自己的习惯修改：

- 仓库名：`howls-moving-castle`
- 简介：`A 60-second procedural journey through seasons, flight and dawn. Three.js interactive film with Blender authoring sources.`
- Topics：`threejs`、`blender`、`procedural-generation`、`animation`、`webgl`、`creative-coding`

## 2. 开启在线演示

仓库内已经包含构建好的 `index.html` 与 `.nojekyll`。提交后打开仓库的 **Settings → Pages**：

1. 在 **Build and deployment** 中选择 **Deploy from a branch**。
2. 选择实际存放项目的分支（通常为 `main`），目录选 **`/ (root)`**，保存。
3. 等 GitHub 显示成功的部署结果，用它返回的网址打开网页。再将这个真实网址填到仓库的 Website 栏或 README。

无需在 Pages 上安装 Node，也无需配置线上构建。网页入口不使用域名根路径，因此适合 `用户名.github.io/仓库名/` 这样的项目站点。

若账户没有这一发布选项，按 GitHub 返回的仓库可见性与套餐说明处理。[GitHub Pages 官方建站步骤](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) · [发布来源设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 3. 放上你已经渲染好的视频

网页互动版与 Blender 成片可以并列展示。将完成的 MP4 添加到 GitHub Release，或者上传到自己使用的视频平台，再把实际链接放在 README 的开头。保留标题、时长和渲染方式，访客就能区分实时互动与 Cycles 成片。

带原编配音乐的个人 HTML 保存在公共项目包外。要公开配乐，先确认所用音频可随作品发布；也可以沿用仓库中的本地配乐导入功能。

## 4. 后续更新

在 `src/` 和 `direction/` 修改代码，执行 `npm run build`，并把更新后的源文件与 `index.html` 一起提交。若只改 README 或制作文档，不需要重新构建网页。

原生工程继续在 `blender/` 的说明路径中处理。源码、互动入口与最终 MP4 的版本可以使用同一个 Release 标签，方便以后对照。
