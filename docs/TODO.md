in the future: add unsplash images to the images tab.

When i edit something visually there should be a git diff line thing in the monaco editor that appears for like 1 second before leaving.

file ->open should do the same are u sure u wanna overwrite? prompt
background gradient instead of just colors in settings

change "untitled design to my <NAME> screenshot (or something branded to this website)

bug: cannot close the ctrl f find tab with the far right close button 
bug: switching the font, then clicking undo undos both the font and the previously done thing

add to agents.md that when a new feature is added, consider if i need to update ai prompts


# EVENTUALLY:
To make there be gaps between the rendered canvas, i did some logic but the tradeoff is that the page render is repeated numPages times per frame. I'm sure there's a better way to do this.
Ai can generate images and then upload them to upload thing and edit images.

on device-frames: 
The upstream API has 143 frames and /find_template is one call per variation, so the very first cold request to /api/device-frames will be slow (a few seconds). After that it's cached for a day. If first-load latency feels bad in practice, we can swap to lazy per-category fetches when you wire up the click-to-add behavior  - so idk if itd be better to have list_frames endpoint return frame urls to the image hosted on github.idk. should we extend caching length?

i should be ablt to click on elements so theyre referenced in the chat for ai (like how u can @ files in cursor)

feature graphics

upload multiple photos, drag and drop

on export, have a popup saying something like "made something nice? wanna share - add this design as a template" - then a button that opens a PR to github for me to review

sync to github button on json panel

use asc cli to put on your app store connect directly

internatilizatoin