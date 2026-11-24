# Blender 制作源码

这部分保留从程序化场景建立最终 Blender 工程的制作路径。仓库根目录的 `src/` 和 `direction/` 是最后互动版的网页源码；这里的 `source/` 是供原生导出器读取的制作基线，随后由导演脚本、机件细化和 Blender 原生效果完成最终场景。

本目录不包含 `.blend`、已渲染视频、PNG 序列或配乐。已有最终 `.blend` 时，可以直接在 Blender 里继续编辑和渲染，无需重建。

## 内容

| 路径 | 作用 |
| --- | --- |
| `source/howls_moving_castle_dynamic60.html` | 原程序化建模基线，已移除内嵌音轨 |
| `render/prepare_castle.py` | 细化城堡壳体和可见机件 |
| `direction/` | 相机、起飞、天气、角色与确定性时间轴 |
| `export/export_scene.cjs` | 导出网格、实例、程序纹理与动画数据 |
| `render/scene_build.py` | 组装 Blender 网格、材质、灯光和摄影机 |
| `motion/` | 机身惯性、火焰形变、烟尘、中文章节标记及可选声音条 |
| `render/flicker_native_master.py` | Mist 与天空覆盖通道、防闪采样曲线、PNG 输出设置 |
| `render/flicker_native_samples.json` | 基础 16 采样；炉火与夜航 32 采样的区间表 |
| `render/flicker_native_render.py` | Linux/macOS 命令行原生帧输出与断点续渲 |
| `finish/color_finish.py` | 最后一次轻微增色的实际算法 |
| `finish/finish_video.py` | 从完整原生帧统一生成 MP4，可选本地配乐 |

## 从源码重新建立场景

制作基准为 **Blender 4.3.2**。安装 Node.js 20 或更新版本，终端进入本目录。网页的运行与构建不需要安装本目录的画布依赖。

```bash
cd blender
npm install
python3 render/prepare_castle.py source/howls_moving_castle_dynamic60.html render/castle_refined_source.html
node direction/timeline.cjs
node export/export_scene.cjs
blender -b --python-exit-code 7 -P render/scene_build.py -- --width 1920 --samples 8 --engine CYCLES --output render/rebuilt-base.blend
blender -b render/rebuilt-base.blend --python-exit-code 7 -P motion/finalize_project.py -- --output render/rebuilt-final.blend --samples render/film_samples.json
blender -b render/rebuilt-final.blend --python-exit-code 7 -P render/flicker_native_master.py -- --output render/howls_moving_castle.blend --schedule render/flicker_native_samples.json
```

这套命令会导出并烘焙 1440 帧的动画，生成可编辑工程。它会占用明显多于网页构建的时间和磁盘；没有指定 `--preview`，因此不会自动渲染测试画面。最终一步将采样改为 16/32，前面的 `--samples 8` 是组装阶段的临时设置。

在 Windows 上可将 `python3` 换成 `python`；如系统找不到 `blender`，使用 Blender 可执行文件的完整路径。网页与本文不依赖固定的用户目录。

导出器的画布依赖固定为 `@napi-rs/canvas` 0.1.100。Blender 自带 Python、NumPy 和 `bpy`。默认使用随包的 `render/weather_sky_data.png`；如需改写生成器并重做该图，再在普通 Python 环境安装 NumPy、SciPy 和 Pillow，运行 `python3 render/sky_map.py`。

### 加入自己的音频

`motion/finalize_project.py` 现在默认生成无声工程。需要配乐时，在这一步添加 `--score`，例如：

```bash
blender -b render/rebuilt-base.blend --python-exit-code 7 -P motion/finalize_project.py -- --output render/rebuilt-final.blend --samples render/film_samples.json --score audio/my-score.m4a
```

这里要求输入 60 秒的音频，以匹配完整时间轴；声音条将打包到个人的 `.blend` 内。仓库已经忽略本地音频及 `.blend` 文件。

## 输出原生画面

跨平台最直接的方式是打开最终工程，确认「输出属性」的路径、1920×1080、24 fps、1–1440 帧，使用 Blender 的「渲染动画」。输出为 RGB 8-bit PNG，保留 AgX 显示效果。

Linux/macOS 还可以用带核验与续渲的脚本：

```bash
blender -b render/howls_moving_castle.blend -t 8 --python-exit-code 7 -P render/flicker_native_render.py -- --output production_v5/frames --worker local-render
```

每帧提交前核对 Blender 写入 PNG 的实际帧号和采样数，再记录散列；只有匹配当前工程与设置的帧才会复用。修改工程后使用新的帧目录。此脚本使用 POSIX 文件锁，Windows 可以使用上面的 Blender 界面输出方式。

## 合成完整影片与轻微增色

需要普通 Python 3 和包含 `libx264`、`zscale` 的 FFmpeg。`ffmpeg` 与 `ffprobe` 都应能在终端运行。以下工具只读取已完成的原生序列，不启动渲染：

```bash
python3 finish/finish_video.py --frames production_v5/frames --output output/howls_moving_castle.mp4
```

如果 Blender 界面生成的文件叫 `0001.png`，添加 `--pattern "%04d.png"`。需要合入自己的配乐时添加 `--audio audio/my-score.m4a`。恰为 60 秒、48 kHz 双声道的 AAC 可直接复用；其他音频将裁切或补齐到 60 秒并编码为 AAC。

默认只执行一次轻微增色：目标色度 1.08，接近显示色域边界时收小增幅，保留原始亮度通道。已经调过色的 PNG 请加 `--no-grade`，避免重复叠加。脚本校验完整 1440 帧以及输出尺寸、帧率和解码帧数，并写入相邻的 `.validation.json`。已有同名文件时，默认拒绝覆盖。

## 网页与原生工程的对应关系

两个版本共用这一分钟的叙事、机位和主要动作。Blender 额外构建了原生火焰形态键、世界坐标粒子、网格表面与合成通道；Three.js 使用实时材质、着色器和后处理。网页是可交互的实时版本，Cycles 成片具有自己的材质与照明表现。

完整的作品分镜与制作决策见仓库根目录的 `docs/`。
