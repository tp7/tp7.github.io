---
title: Real-time video filtering in JavaScript
date: 2014-05-01
template: article.html
---
<base target="_blank">

Video processing is moving to runtime - with powerful PCs we have today, it's entirely possible and in fact easy to apply some (fairly complex) filtering on playback, thus avoiding the need for the time-consuming encoding stage [with ancient and overcomplicated tools][1] *plus* getting the ability to modify the video in the exact way the end user wants to see it. 

While we have this area covered quite well on desktop with tools like [ffdshow raw video filter][2] and [madVR][3], we don't have anything like this in the browser. You either have to enjoy the full ugliness of some YouTube videos or use external apps such as [MPC-BE][4] to rip them, which is far from being convenient. It would be nice to avoid all the hassle, press a button and enjoy the filtered video right where it's supposed to be.

### The problem

I've asked around and apparently I'm not the only one who thought about it, which means this time I might actually get more than one user. So I started researching the field and it appears that the most reasonable way of implementing this is a browser extension, written entirely in JavaScript. Most of the codebase could be shared between different extension versions for different browser, plus you could easily get into extension stores.

The basic workflow of this extension is simple: find a *video* tag on the page, get frames from it and display them on a canvas placed on top of the video. There are questions about CORS and some sites still using Flash but those are not relevant for most cases. 

The real issue with this approach is the implementation language - JavaScript. The single reasonable alternative is [Google Chrome Native Client][5] which (surprisingly) works only in Chrome, while Mozilla doesn't appear to have any plans of supporting it in the future. But this shouldn't be a problem, right? JavaScript is getting faster these days and a lot of programmers on the internet argue that it's the only language you ever need to write almost any kind of software. There are also some great tools like asm.js, SIMD.js, WebGL and WebCL which could make your extension run only a little bit slower than native code.

Well, not exactly. 

### The pure JavaScript

Pure JS filtering works in the following way:

1. Get the video element and hide it.
2. Add a canvas to the page, placed exactly above the video element.
3. Using a timer, on every tick:
    1. Draw the video frame on the canvas using `context.drawImage(video, 0, 0)`
    2. Get frame buffer from the canvas, using `context.getImageData(0, 0, width, height)`
    3. Process the buffer with whatever filters you want, it's just raw ARGB bytes
    4. Put the image data back (or to another canvas), using `context.putImageData(imageData, 0, 0)`

This approach works and it allows you to do real filtering in JavaScript with just minimal amount of very-close-to-regular-C code. Here's the basic implementation of *invert* filter:
```javascript
outputContext.drawImage(video, 0, 0);
var imageData = outputContext.getImageData(0, 0, width, height);
var source = imageData.data;
var length = source.length;
for (var i = 0; i < length; i += 4) {
    source[i  ] = 255 - source[i];
    source[i+1] = 255 - source[i+1];
    source[i+2] = 255 - source[i+2];
    // ignore the alpha
}
outputContext.putImageData(imageData, 0, 0);
```
Unfortunately, it doesn't work on any reasonably high resolution. While `drawImage` itself is [very quick][6] even on 1080p, simply adding `getImageData` and `putImageData` calls to it [brings execution time to 20-30ms here][7]. Adding the included [*invert*][8] code makes it 35-40 (yes, I know you can optimize it), which is the maximum limit for PAL video (25fps, 40ms per frame). And I'm using a 4770k which is one of the most powerful home-level CPUs right now. This means you cannot run any reasonably complex video filter on a one-two years old CPU **no matter how fast your javascript code is**. Depressing, isn't it?

But JS code is very slow on its own. While it might work for simple point operations like invert or a lut, but it fails short on anything more complex. [Simple noise filter][9] implementation that adds random value to every pixel runs at 55ms. [3x3 blur kernel][10], implemented in the following function (ignoring border conditions), runs at about 400ms, 2.5 frames per second!
```javascript
function blur(source, width, height) {
    function blur_core(ptr, offset, stride) {
        return (ptr[offset - stride - 4] +
                ptr[offset - stride] +
                ptr[offset - stride + 4] +
                ptr[offset - 4] +
                ptr[offset] +
                ptr[offset + 4] +
                ptr[offset + stride - 4] +
                ptr[offset + stride] +
                ptr[offset + stride + 4]
                ) / 9;
    }

    var stride = width * 4;
    for (var y = 1; y < (height - 1); ++y) {
        var offset = y * stride;
        for (var x = 1; x < stride - 4; x += 4) {
            source[offset] = blur_core(source, offset, stride);
            source[offset + 1] = blur_core(source, offset + 1, stride);
            source[offset + 2] = blur_core(source, offset + 2, stride);
            offset += 4;
        }
    }
}
```
Firefox manages to do it even "better" at 800ms/pass. Clearly, pure JavaScript is not the right way to implement any video filtering right now.

### asm.js

[Asm.js][11] is Mozilla's way to optimizing JavaScript execution. The code it generates will still run in Chrome but you shouldn't expect any significant performance difference there as V8 [doesn't seem to support it yet][12]. Firefox on the other hand should get some nice speedup.

Unforuntately I couldn't come up with any reasonable way to optimize only a few functions using asm.js. [Emscripten][13] generates some 4.5k lines of code file when fed with a trivial 2 lines function, with no apparent way of extracting the required code from it. And you really don't want to [write asm.js manually][14] unless you hate yourself ([very useful article on hurting yourself with asm.js][15], in russian). Moreover, no matter how fast asm.js is, it won't fix the issue with 30ms lag of `getImageData->putImageData` chain.

### SIMD.js

[SIMD.js][16] is an even newer technology which is currently kinda supported only in [Firefox Nightly][17] but which has all chances to [get support everywhere very soon][18]. Unfortunately, right now the API [supports only two data types][19], float32x4 and uint32x4, meaning it's basically useless for any real video filtering. Moreover, Int32x4Array type doesn't seem to be implemented in Nightly yet, which makes writing and reading values from memory buffer extremely slow (when implemented in [this][20] way). Still, here's an example code for the usual invert filter.
```javascript
function invert_frame_simd(source) {
    var fff = SIMD.int32x4.splat(0x00FFFFFF);
    var length = source.length / 4;
    var int32 = new Uint32Array(source.buffer);
    for (var i = 0; i < length; i += 4) {
        var src = SIMD.int32x4(int32[i], int32[i+1], int32[i+2], int32[i+3]);
        var dst = SIMD.int32x4.xor(src, fff);
        int32[i+0] = dst.x;
        int32[i+1] = dst.y;
        int32[i+2] = dst.z;
        int32[i+3] = dst.w;
    }
}
```
Unfortunately it runs a lot slower than pure JS right now (try it [here][21]), at about 1600ms/pass. Looks like we'll have to wait for some time before it'd be possible to do anything of value with this technology. It is also not clear if it'll be possible to use 256-bit registers (int32x4 is SSE2) and newer instruction sets like the very useful SSSE3. Plus you'll still have to deal with the getImageData lag. But you can already get some [nice SIMD bugs][22] which you know and love!

### WebGL

A completely different way of doing things is [WebGL][23]. WebGL is basically a JavaScript interface for native OpenGL implementation, which allows you to run some fancy code on GPU. It's usually used for graphic programming in games and such, but you can also do some [image][24] and even [video][25] processing with it. Moreover, you don't have to call the usual getImageData routine, which means that it isn't limited by the 20ms lag.

But the power comes at a price - **WebGL is *not* designed for video processing and using it this way is a giant pain in the ass**. You need to go through the whole process of defining vertices (which will always cover the whole frame), defining texture positions (which will always cover the whole frame) and then [applying the video as a texture][26]. Thankfully, WebGL is smart enough to get frames from the video automatically. Well, at least in Chrome and Firefox, IE11 is not so happy about it:

> WEBGL11072: INVALID_VALUE: texImage2D: This texture source is not supported

Moreover, you have to deal with [somewhat braindamaged GLSL language][27], which [doesn't even support defining constant arrays][28], so you either have to pass them as uniforms (fancy kinda-global variables), or do it the old way:
```
float core1[9];
core1[0] = 1.0;
core1[1] = 1.0;
core1[2] = 0.0;
core1[3] = 1.0;
core1[4] = 0.0;
core1[5] = -1.0;
core1[6] = 0.0;
core1[7] = -1.0;
core1[8] = -1.0;
```
In short, CUDA and OpenCL were implemented *not* because OpenGL (and DirectX for that matter) is great for generic-purpose programming.

On the bright side, WebGL delivers truly amazing performance for web (which you have no easy way to measure) - it can process [masktools prewitt core][29] (four different 3x3 cores) in real time on a 1080p video (and higher resolutions) without any problems. If you hate yourself and are not afraid of the not-so-maintainable codebase, you could definitely do some very fancy things with it. If you hate yourself a little less and you're fine with depending on a large library, do take a look at [seriously.js][25]. If you're like me and want to keep your code clean, then you probably want to use WebCL.

### WebCL

But you can't. According to [wikipedia][30], WebCL 1.0 was finalized on March 19, 2014. This makes it the youngest technology yet, even newer than SIMD.js. And unlike SIMD.js, it [won't be implemented in Firefox][31] any time soon. I can't find the link but remember reading that it won't make it to Chrome either, for security reasons and whatnot. We're totally out of luck here. 

### Conclusion

Real-time video processing inside your browser is possible. Kinda. 

The only way of doing it with reasonable performance is using WebGL, which offers very fast execution at the price of a very ugly codebase. All other ways have to deal with the awful canvas performance and are either too slow or too new and unpolished to be used in real world. 

It's very unlikely that I'll be implementing this extension myself because I simply don't hate myself enough. A single look at the [webgl demo][32] source code makes me want to never touch graphics programming again. But who knows what might happen tomorrow.

#### Notes

1. All demonstrations are based on a looped video which lags horribly on looping in most browsers. This happens because [browsers suck][33].
2. If you don't like looping video, add `loop=false` query parameter to the demo url.
3. Both demonstrations contain full source code right in the html files with no external dependencies, which is probably useful for learning.
4. I have no idea what I'm doing in JavaScript or WebGL.


  [1]: http://avisynth.nl/index.php/Main_Page
  [2]: http://sourceforge.net/projects/ffdshow-tryout/
  [3]: http://forum.doom9.org/showthread.php?t=146228
  [4]: http://sourceforge.net/projects/mpcbe/
  [5]: https://developer.chrome.com/native-client
  [6]: pure.html?filter=none
  [7]: pure.html?filter=copy
  [8]: pure.html?filter=invert
  [9]: pure.html?filter=noise
  [10]: pure.html?filter=blur
  [11]: http://asmjs.org/
  [12]: https://code.google.com/p/v8/issues/detail?id=2599
  [13]: https://github.com/kripken/emscripten
  [14]: https://github.com/NightMigera/piHex/blob/master/pi.js
  [15]: http://habrahabr.ru/post/193642/
  [16]: https://01.org/blogs/tlcounts/2014/bringing-simd-javascript
  [17]: https://nightly.mozilla.org/
  [18]: http://www.phoronix.com/scan.php?page=news_item&px=MTY0ODE
  [19]: http://www.2ality.com/2013/12/simd-js.html
  [20]: https://github.com/johnmccutchan/ecmascript_simd/blob/master/src/int32x4array.js#L107
  [21]: pure.html?filter=simd
  [22]: pure.html?filter=buggySimd
  [23]: https://en.wikipedia.org/wiki/WebGL
  [24]: http://www.html5rocks.com/en/tutorials/webgl/webgl_fundamentals/
  [25]: http://seriouslyjs.org/
  [26]: https://developer.mozilla.org/en-US/docs/Web/WebGL/Animating_textures_in_WebGL
  [27]: https://github.com/brianchirls/Seriously.js/blob/0d029c40401f98aea9cd6170bef7866f6c1750ac/effects/seriously.dither.js#L51
  [28]: https://stackoverflow.com/questions/15262729/const-float-array-in-webgl-shader
  [29]: webgl.html
  [30]: https://en.wikipedia.org/wiki/WebCL
  [31]: https://bugzilla.mozilla.org/show_bug.cgi?id=664147#c30
  [32]: webgl.html
  [33]: https://stackoverflow.com/questions/17930964/video-element-with-looping-does-not-loop-videos-seamlessly-in-chrome-or-firefo