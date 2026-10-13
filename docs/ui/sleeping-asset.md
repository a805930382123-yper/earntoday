# 睡觉人物素材

输出：`src/assets/chibi-girl-sleeping.png`（1860×845，透明 PNG）。

来源：内置 imagegen，以项目原有 `src/assets/chibi-girl-top.png` 为编辑目标生成独立闭眼版本，沿用同一人物、白猫、服装和手部接触位置。生成后直接复制到项目，未通过程序粗暴旋转、压缩或绘制遮盖眼睛。两种姿态使用同一固定容器和 object-fit，侧发复用已有透明图层。参考 UI 图不作为界面背景。

完整生成提示词：

> Use case: identity-preserve. Asset type: transparent PNG desktop character sprite, paired sleeping variant of existing sprite. Input image 1 is the exact existing working character sprite to edit. Preserve her identity, blue long hair, white lace maid headdress, blue bows, pink cheeks, little sleeping white cat, line art and coloring. Preserve the exact silhouette, framing, size, locations of head, hair, hands and elbows so the two sprites can crossfade without shifting the card. Change only expression and subtle head relaxation: both eyes naturally fully closed with soft dark eyelash arcs, resting cheek on hands, relaxed comfortable nap pose leaning on the top edge of an invisible card. Do not rotate or flatten the image. Remove floating Z symbols, exclamation marks, sparkles and any visible cyan card strip at the bottom: these will be rendered separately in CSS. Both hands remain in their original positions, resting on the same horizontal edge. No card, UI, lettering, money, or background. Fully transparent alpha outside character and cat; do not add checkerboard or opaque white/black background. Retain the reference sprite's landscape aspect ratio and minimal transparent padding. High quality clean edges.
