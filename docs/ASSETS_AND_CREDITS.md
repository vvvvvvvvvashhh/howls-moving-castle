# 素材与署名

《风起，城行》是一部以《哈尔的移动城堡》为题材的同人动画。原著作者为戴安娜·韦恩·琼斯，电影由宫崎骏执导。原工程以吉卜力的电影剧照研究城堡的轮廓、烟囱的排列和高地景色。电影署名为 © 2004 Diana Wynne Jones/Hayao Miyazaki/Studio Ghibli, NDDMT。[吉卜力工作室作品页](https://www.ghibli.jp/works/howl/)

## 画面从哪里来

| 素材 | 来源与制作方法 |
| --- | --- |
| 城堡和角色 | 在 Three.js 中用几何体搭建。锅炉外壳、船首、管道和铆钉见 [castle.js](../src/castle.js)，乌鸦、火焰和芜菁头分别见 [crow.js](../src/crow.js)、[calcifer.js](../src/calcifer.js) 和 [turnip.js](../src/turnip.js)。 |
| 高地、城镇和四季 | 脚本生成地形、湖岸、草木与建筑。花叶、炉火和部分表面细节用 Canvas 绘制为纹理。[高地地形](../src/landforms.js) · [沿途植被](../src/journey-flora.js) · [城镇建筑](../src/journey-town.js) |
| 网页载入图 | 沿用原互动页内嵌的 1280 × 720 JPEG。图中城堡位于红屋顶小镇和湖水之间，远处是雪山。[载入图原件](../assets/loading.jpg) |
| Blender 天空数据图 | 用固定随机种子生成的 2048 × 1024 数据图。红通道记录云的覆盖，绿通道记录云层明暗起伏，蓝通道记录星光。世界材质读取这三层数据来控制昼夜变化。[数据图](../blender/render/weather_sky_data.png) · [生成脚本](../blender/render/sky_map.py) |

## 声音

原互动页的 MP3 标签将作曲者列为久石让（Joe Hisaishi），曲名为《人生的旋转木马》（*Merry-Go-Round of Life*）。制作记录写明，这段短版器乐用 S. Christian Collins 的 GeneralUser GS 2.0.3 音色重新演奏，再混入为场景制作的拟音。Blender 交付工程打包的是 60 秒、48 kHz 双声道 AAC 混音。[GeneralUser GS 音色库](https://schristiancollins.com/generaluser/)

现存工程资料中没有这段编配和混音的公开分发授权记录。公开网页默认静音，保留完整的 60 秒镜头和动作。点播放器右上角的「选配乐」即可选择本机音频，拖动时间轴时，声音也会跳到相应位置。

## 代码许可

Three.js 和 `FXAAShader` 使用 Three.js r170 的 MIT 许可证。Three.js 内含的 Earcut 移植源自采用 ISC 许可的 Mapbox Earcut 2.2.4。作者尚未为本项目自写代码和文档指定复用许可证。[第三方组件与许可证全文](../THIRD_PARTY_NOTICES.md)
