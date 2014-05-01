---
template: article.html
title: Efficient scenefiltering with AviSynth
date: 2013-09-12
---

Scenefiltering is a cancer of encoding. It’s a drug. It’s surprisingly easy to start doing it and almost impossible to quit. You don’t even notice how it consumes all of you. You think you’ll just filter one or two scenes differently and in no time you’re enhancing every frame using Adobe® Photoshop® software. Don’t even start. It’s not worth it. No one will ever notice your effort.

But, sooner or later everyone tries it. In this post I’m going to describe my workflow, one which could possibly make your scenefiltering a little less painful and more efficient. Think of it as similar to programming – without knowing the fundamentals, you may end up rewriting the whole thing from scratch because it’s too slow to run and harder to read than captcha!


Before we start, one more thing – what do I even mean when I say “efficient”? Efficiency is both the time you spend on filtering and the time your encoding machine actually spends processing frames. Obviously, the first one is more important unless you have unlimited free time and limitless patience. You can’t forget about encoding speed either though– a script that doesn’t run is useless. The goal is to spend as little time as possible, while keeping the script workable, preferably in a single pass.

Also, this article assumes RFS-based scenefilter, i.e. stuff that does not modify clip properties such as frame count. In other words – anything you can do with ReplaceFramesSimple.

So, what do you do?

 1. First of all, install [AvsPmod][1] if you don’t have it yet. It most likely will run in wine, but if it doesn’t – you probably should install a Windows VM because using AvsP is important. Right after installing it, go to `Options -> Program settings -> User          Sliders` and disable `Create user sliders automatically`. Sliders are useless most of the time (I never use them) and they             considerably slow down initial loading of large scripts (scripts with many filter calls).
 2. Make keyframes. Ask your timer if you don’t know how or read about it here.
 3. Prepare your video. You should use the fastest source filter available, being it ffvideosource, lwlibavvideosource, avisource or rawsource. DgIndex, dss2 or other slow source filters will make previewing painful.
 4. Learn how to use ReplaceFramesSimple (found [here][2]). This is the main working horse of all scenefiltering. That will help you keep your scripts readable.

Now, if you stare at your source for a while, you’ll notice that most frames can be processed with the same **default filter chain**. For example it’s highly likely that most bright scenes don’t even need any kind of debanding or look fine after a simple one. Write a chain that satisfies you on as many frames as possible. It doesn’t have to work everywhere though, because you’ll be changing the filtering for some scenes later. At this point your script will look like

    ffvideosource("source.mkv")
    o = last
    default_filtering()

Do note that it’s okay to omit the default filtering entirely if you can’t come up with it. It just means you’ll spend more time scenefiltering later.

Then you have to write **filtering primitives and presets**. This is the hardest step so take your time. Check a few scenes that require scenefiltering and write down parts of your filter chain for these. Or come up with filtering that looks good on this particular scene and decompose it to basic building blocks like “denoising”, “debanding”, “antialiasing” etc., then merge them all in a single script, writing each in its own variable (obviously not duplicating stuff). Basically you should end up with a script like

    #~ all previous stuff
    strong_denoise = denoise1()
    weak_denoise = denoise2()
    denoise_16bit = denoise3()
    strong_debanding = deband1()
    weak_deband = deband2()
    super_strong_debanding = denoise_16bit.deband3()
    #~ and so on

You might be wondering why doing this? The answer is simple – avisynth has real problems running scripts with many filter calls. It kills caching, requires more memory and in general it is the most important reason why large scripts might not run at all. So use as little filter calls as possible. This might get [fixed in vapoursynth][3], but for now it has the same kind of problems.

This works because it’s highly unlikely that you’ll need some specific filtering for every scene you process. Most of them share something in common. Studios don’t change processing in the middle of the source just to troll encoders, you know (SHAFT not included). If you can remove all the noise with dfttest(sigma=1000) in most scenes, you can expect it to work everywhere.

Now you’re almost done with the preparation step (and probably don’t want to scenefilter anymore, which is a good thing). The last thing is to prepare replaceframes calls. It’s easy and doesn’t require any thinking. The only interesting part is where to place these calls.

If you prefer to keep stuff neat, you probably have your primitives/presets grouped by their type (debanding, denoising etc.). If you don’t – do it now. Then place them in a way you’d filter stuff in a regular script – for example, denoising goes before debanding, antialiasing is the last step and so on. Then put replaceframes calls with every filter in the previous block between them. Your script will end up looking like

    strong_denoise = denoise1()
    weak_denoise = denoise2()
    denoise_16bit = denoise3()
    RemapFramesSimple(strong_denoise, mappings="")
    RemapFramesSimple(weak_denoise, mappings="")
    strong_debanding = deband1()
    weak_deband = deband2()
    super_strong_debanding = denoise_16bit.deband3()
    RemapFramesSimple(strong_debanding, mappings="")
    RemapFramesSimple(weak_deband, mappings="")
    RemapFramesSimple(super_strong_debanding, mappings="")

Since you can’t mix clips with different resolutions, there’s no point in writing a RFS call for denoise_16bit.

And now you’re finally done and can actually start scenefiltering. The whole procedure takes only a few minutes and the same template can be copypasted for every episode in a series.

Okay, so what to do next? You still have the most time-consuming part to do – find ranges and decide what to do with them. And this is where AvsP comes in handy.

First of all, **load keyframes** you’ve done with Import bookmarks from file macro. Try navigating between them with `Video -> Navigate -> Next/Previous` bookmark and assign some simple shortcuts to these commands, you’ll be using them a lot.

The whole processing workflow is simple:

 1. Navigate to the start of the next scene
 2. Decide what filtering you want to do here, if any. Look at a few frames at the beginning and in the end of the scene. If video changes a lot inside the scene – check some frames in the middle. More often than not, you’ll be able to come up with a single filter chain for the whole scene.
 3. Write down the range `[start_frame_of_the_scene last_frame_of_the_scene]` in appropriate RFS call. You don’t have to do it by hand – [there’s a macro for that][4], that will insert the scene (one bookmark to the left and one to the right of your current frame) at the caret position. Sometimes scxvid gets it wrong and you need to change the frame in inserted range. Don’t worry – [there’s a macro for that][5]. Just select the frame you want to replace, press a button and it will get replaced with current frame.
 4. Move to next scene

The whole scenefiltering is basically a combination of F2, Shift+F2, F4, Shift+F4 and F5 hotkeys (obviously depend on your setup).

Now there are probably some questions left. For example, why did you have to decompose filtering to primitives? The answer is simple – it allows your filter chain to be dynamic. For example, you have a scene where you want to apply denoise1() and then deband2(). Not a problem! Put the same range in their RFS. No denoise at all and only deband1()? Not a problem either!

This allows to eliminate a lot of duplicated filter calls, makes your script faster to run and easier to read and modify. Came up with a new good way of denoising? Just add it to appropriate primitive block and start using it with any filter down by the script.

But how do you actually decide what works better on any particular scene? The answer is again simple – using AvsP tabs. Basically you should have the main working tab, source tab (without any filtering) and as many tabs with different filtering presets as you want (more tabs eat more memory and make avsp less stable though). Then at any scene you aren’t sure how to handle, just switch between different tabs, see which one works better and apply this preset to the main script, possibly with some slight modification (it’s easy since you’re using primitives).

The only “problem” left is masking. Always put it in the end of your script right after all “generic” filtering. Notice how in the last example script I put everything in variables, even though most of them are used only once. This simplifies RFS calls used for masking because you can reuse the variables there. Basically, you come up with another block of filtering presets (not primitives) and your end script looks like:

    #~ all previous stuff
    filter1 = weak_denoise.super_deband()
    filter2 = weak_denoise.other_super_deband()
    #~ and so on
    ReplaceFramesSimple(mt_merge(filter1, o.masking1()), mappings="[x y]")
    ReplaceFramesSimple(mt_merge(filter1, o.masking2()), mappings="[x y]")
    ReplaceFramesSimple(mt_merge(filter2, o.masking3()), mappings="x y z")

This is probably all I wanted to say on scenefiltering today. And some related advices in the end:

 - Prefer to group OP/ED filtering into its own block but don’t separate it into functions. Grouping is important because it allows you to easily reuse scenefiltering between different episodes. You just have to shift ranges and guess what, [there’s a macro for that][6]. Just select appropriate ranges and apply it.
 - It might be more efficient to scenefiltering the thing twice, looking for different kinds of bugs, rather than doing everything at once.
 - Actually you need two “source” tabs – one to always be able to look at the source itself and one to play with masking.
 - Always use the source clips to build masks, not the filtered one (notice the o variable used at the source in the last example). Who knows what kind of silly stuff you can have in your last variable.
 - In AvsP you might want to disable `Options -> Program Settings -> Video -> Refresh preview automatically`. Otherwise it will update the script every time you insert a range, making your life much more painful and scenefiltering slower (initial graph building of scripts with scenefiltering is insanely slow).
 - Always put ranges inside a single RFS call and different RFS calls (masking) in ascending order. It will make your life easier.
 - Comment out RFS calls you don’t need right now. You don’t have to reload 100 lines of masking overrides in the OP when you’re filtering the ED.
 - If possible – do not scenefilter at all.


  [1]: http://forum.doom9.org/showthread.php?t=153248
  [2]: http://avisynth.org/stickboy/
  [3]: https://github.com/vapoursynth/vapoursynth/issues/36
  [4]: http://pastebin.com/F0Ntp7rq
  [5]: http://pastebin.com/6hwjET0w
  [6]: http://pastebin.com/h4GHXYfa