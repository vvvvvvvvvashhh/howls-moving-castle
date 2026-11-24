# Third-party notices

## Three.js r170（0.170.0）

`three.module.js` 提供三维渲染器。项目随包保留该版本的源代码，并将它编入离线 HTML。`FXAAShader.js` 取自同一版 Three.js 的示例目录。原着色器注明，FXAA 算法来自 NVIDIA，C# 实现由 Jasper Flick 编写，GLSL 移植由 Dave Hoskins 完成。两份文件均保留上游署名。[库与版本](https://github.com/mrdoob/three.js/tree/r170) · [FXAA 源文件](https://github.com/mrdoob/three.js/blob/r170/examples/jsm/shaders/FXAAShader.js) · [该版本的许可证](https://github.com/mrdoob/three.js/blob/r170/LICENSE)

```text
The MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Earcut 2.2.4

Three.js 的几何模块内含 Mapbox Earcut 2.2.4 的移植实现，用于将多边形轮廓划分为三角形。[Three.js 移植源码](https://github.com/mrdoob/three.js/blob/r170/src/extras/Earcut.js) · [Earcut 2.2.4 许可证](https://github.com/mapbox/earcut/blob/v2.2.4/LICENSE)

```text
ISC License

Copyright (c) 2016, Mapbox

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

## @napi-rs/canvas 0.1.100

Blender 场景导出工具通过 npm 安装这个 MIT 许可的 Node.js 画布库，在本地生成程序纹理。浏览器使用自己的 Canvas API。原生二进制由 npm 按运行平台安装。[项目主页](https://github.com/Brooooooklyn/canvas) · [0.1.100 版许可证](https://app.unpkg.com/@napi-rs/canvas@0.1.100/files/LICENSE)

