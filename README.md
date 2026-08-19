# Gypsum

A browser based view of text files saved on your computer. I named it Gypsum because it is a flakier, less robust version of Obsidian. It is also (at the time of writing) 350kb and no external scripts vs Obsidian which as an electron app weights in something like 100mb or more... 

This is built for my personal use so I don't make any guarantees about how well it will work for anyone else!

## What's the point of it?

- Because it works client side in the browser you can use it on any computer. Either served as a normal webpage or just download the single bundled html file. Unlike Obsidian you don't need to download a massive desktop application.
- It does have depencencies (for example `marked.js` and `fast diff`) but those are included as bundled files rather than using the official cdn. Ie no *remote* dependencies are used.
- Because I decided to use ES Modules the downloaded files and directories will not work directly on the file system. I am
  - bundling the js with a github action and saving as an artefact that can be downloaded from the actions area.
  - serving on github pages as a pwa that works offline.
- The idea is that I can use it on a train with a bad wifi.
- It is also intended to be simple enough for me to understand not only now but in the future too, so that it is easier to modify and muck around with.

## Warnings

1. It is only tested on up to date versions of Chrome and Edge. It relies on a fair bit of new and newish css to work so I suspect that Safari would mess things up (as it often does) and Firefox would be way behind.
2. Only use on your own trusted text and markdown files. I have not escaped anything so html will just get ignored by the markdown engine and get rendered as is.
3. You have to select your folder with text files every time you load the page. I feel like there is no point saving the directory handle to indexedDB because you still have to approve a bunch of permissions anyway.

## What can you do with it?

1. You can view text files saved on your computer (.md and .txt).
2. You can edit files.
3. Html rendered from markdown - syntax is rendered using `marked.js`.
4. You use tags like `#this` to easily associate text files.
5. You can filter notes based on selected tags, either with an `and` filter or an `or` filter.
6. Add a tag of the format `#color/red` (ie `#color/[color]`) and it will use this colour in the file viewer for that file, assuming it is a valid html color name.
7. You can add simple YAML properties to the files, in front matter (ie key value pairs below one `---`and above another `---`). These are visible as columns in the table view.
8. Given it such a simple app it is simple for coding agents to fork, adjust or add features that other users may want.

## Limitations

1. For tag hierarchies only one level of tag classifcation is allowed. Ie `#that/this` is fine `#that/this/them` isn't.
2. Technically this works on mobile - screen sizes work etc - but because accessing the file system is incredibly slow it is basically broken. It will take several seconds to load a handful of files. This is a shame! There is a workaround which is to use the OPFS but this is not a first class feature.
3. No links between files - just don't need it right now as I link with tags.

## Future to do list

General principle is only to build a feature if I have a need for it right now... given 

- Table view is a work in progress. I don't really use it right now, but if I wanted to use text files sort of like a relational database in future this is where I would put in the effort, for example:
  - Saved table views for selected properties (columns).
  - Editing YAML frontmatter properties from the table cells.
  - Links between files (I imagine this as sort of "tunnel" where two files each have the same hash sequence perhaps as query statement after the filename url. The url is cosmetic so if the file name changes it still works because it is anchored on the hash - the filename is cosmetic but also potentially provides obsidian compatability).
  - ability to paste in values across multiple columns and rows (and copy from a range selection too).
- Maybe add markdown extension for footnotes? [marked.js footnotes extension](https://github.com/bent10/marked-extensions/tree/main/packages/footnote)
- Maybe create an extension to allow marked.js to use [uplot](https://github.com/leeoniya/uplot) for charts. I like the look of this library because it is so small at 50kb.

## Behind the scenes

See [DATA-STRUCTURES.md](DATA-STRUCTURES.md) for a reference to the in-memory data structures built on file load, including the per-file TagMap and the global ParentMap.
