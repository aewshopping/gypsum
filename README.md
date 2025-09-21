# Gypsum

A browser based view of text files saved on your computer. It is named Gypsum because it is a flakier, softer version of Obsidian.  

## What's the point of it?

- Because it works client side in the browser you can use it on any computer. Unlike Obsidian you don't need to download an application.
- You can also download the html files and use it offline. It does have depencencies (for example `marked.js`) but those are included as bundled files rather than using the official cdn.
- It is also intended to be simple enough for me to understand not only now but in the future too, so that it is easier to modify and muck around with.

## What can you do with it?

1. You can view text files. You can't edit them. Maybe later you can if I every trust myself to implement this.
2. You can render markdown as html via the use of `marked.js`.
3. You use tags like `#this` to easily associate text files.
4. You can filter notes based on selected tags, either with an `and` filter or an `or` filter.
5. Add a tag of the format `#color/red` (ie `#color/[color]`) and it will use this colour in the file viewer for that file, assuming it is a valid html color name.

## Limitations

1. There are many limitations, but perhaps the biggest one is the number of files it can cope with. Probably no more than a thousand before the browser starts complaining.
  - Every text file is turned into an expandable `details` element, which when expanded shows the content of that file.
  - This is obviously a bad idea with lots and lots of files because your DOM will get overloaded.
2. You can't edit the files. (There is a handy 'copy file name' bit of functionality though which I use to easily open the required file in my text files folder on windows explorer).
3. It only takes the notes in the top level of a folder, it doesn't use sub folders.
4. Only one level of tag classifcation allowed. Ie `#that/this` is fine `#that/this/them` isn't.

## Roadmap

1. Modal text file view rather than using details. I realised that I rarely need multiple notes open at once and this will be more scalable.
2. Table view of the notes, with tags and note properties as column headers, which also allow filtering and sorting. Almost certainly using tabulator js.
3. Virtual DOM that destroy and creates html elements depending on scroll position to avoid having too many html elements at once. Tabulator js does this for you so would be relevant for grid view.
