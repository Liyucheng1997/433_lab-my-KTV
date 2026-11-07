// 内置曲目：全部使用公版（Public Domain）旋律，歌词为本项目原创填词，可自由使用。
// 旋律用简谱记法：
//   1-7 音级，0 休止，i 等同高音 1；' 升八度，, 降八度；# / b 升降半音
//   默认四分音符；每个 _ 时值减半；. 附点；每个 - 延长一拍
//   | 小节线（仅便于阅读）；/ 歌词换行
// 歌词：每个字对应一个音符，~ 表示拖腔（沿用上一个字）。
// 和弦：按小节用 | 分隔，同一小节内用 , 平分；按 C 调书写，播放时随 tonic 移调。

export const BUILTIN_SONGS = [
  {
    id: 'b:huanle',
    title: '欢乐今宵',
    origin: '旋律：《欢乐颂》贝多芬（公版）',
    lang: '国语',
    tags: ['欢快', '合唱', '热场'],
    bpm: 112, meter: 4, tonic: 62, pickup: 0, style: 'pop',
    melody: `3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3. 2_ 2- /
             3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2. 1_ 1- /
             2 2 3 1 | 2 3_ 4_ 3 1 | 2 3_ 4_ 3 2 | 1 2 5,- /
             3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2. 1_ 1-`,
    chords: 'C|G|C|G|C|G|C|G,C|G|G,C|G,C|C,G|C|G|C|G,C',
    lyrics: `今晚相聚包厢里面灯光闪烁多欢畅
             举起话筒放开歌喉唱出心里那首歌
             不管跑调还是破了音朋友们一起拍拍手
             快乐时光就在今夜让我们唱到天亮`,
  },
  {
    id: 'b:xingxing',
    title: '星星听我唱',
    origin: '旋律：《小星星》法国民谣（公版）',
    lang: '国语',
    tags: ['儿歌', '温柔', '入门'],
    bpm: 96, meter: 4, tonic: 60, pickup: 0, style: 'kids',
    melody: `1 1 5 5 | 6 6 5- / 4 4 3 3 | 2 2 1- /
             5 5 4 4 | 3 3 2- / 5 5 4 4 | 3 3 2- /
             1 1 5 5 | 6 6 5- / 4 4 3 3 | 2 2 1-`,
    chords: 'C|F,C|F,C|G,C|C,F|C,G|C,F|C,G|C|F,C|F,C|G,C',
    lyrics: `夜空星星眨眼睛
             好像也在听我唱
             轻轻哼一首老歌
             温柔月光洒窗上
             夜空星星眨眼睛
             陪我唱到梦里乡`,
  },
  {
    id: 'b:wanfeng',
    title: '晚风',
    origin: '旋律：J. P. Ordway《Dreaming of Home and Mother》1851（公版）',
    lang: '国语',
    tags: ['抒情', '怀旧'],
    bpm: 72, meter: 4, tonic: 60, pickup: 0, style: 'ballad',
    melody: `5 3_ 5_ i- | 6 i 5- | 5 1_ 2_ 3 2_ 1_ | 2-- 0 /
             5 3_ 5_ i. 7_ | 6 i 5- | 5 2_ 3_ 4. 7,_ | 1-- 0 /
             6 i i- | 7 6_ 7_ i- | 6_ 7_ i_ 6_ 6_ 5_ 3_ 1_ | 2-- 0 /
             5 3_ 5_ i. 7_ | 6 i 5- | 5 2_ 3_ 4. 7,_ | 1-- 0`,
    chords: 'C|F,C|C|G|C|F,C|G|C|F|C|F,C|G|C|F,C|G|C',
    lyrics: `晚风~轻吹过街霓虹映着窗~~
             老友~重逢举杯盏把酒~话当年
             今宵醉歌~声远相~约~明年~再见
             明月~照我归途远梦里~再相逢`,
  },
  {
    id: 'b:laopengyou',
    title: '老朋友',
    origin: '旋律：苏格兰民歌《Auld Lang Syne》（公版）',
    lang: '国语',
    tags: ['友情', '合唱', '抒情'],
    bpm: 80, meter: 4, tonic: 60, pickup: 1, style: 'ballad',
    melody: `5, | 1. 1_ 1 3 | 2. 1_ 2 3 | 1. 1_ 3 5 | 6-- /
             6 | 5. 3_ 3 1 | 2. 1_ 2 3 | 1. 6,_ 6, 5, | 1-- /
             6 | 5. 3_ 3 1 | 2. 1_ 2 6 | 5. 3_ 3 5 | 6-- /
             i | 5. 3_ 3 1 | 2. 1_ 2 3 | 1. 6,_ 6, 5, | 1---`,
    chords: 'C|G|C|F|C|G|Am,G|C|C|G|C|F|C|G|Am,G|C',
    lyrics: `那些年少时唱过的歌你还记得吗
             那些并肩走过的路我一直记心底
             让我们举杯为了友谊再唱一首歌
             愿我们的友情地久天长永不散场`,
  },
  {
    id: 'b:shengri',
    title: '生日歌',
    origin: '旋律：《Happy Birthday to You》（公版）',
    lang: '国语',
    tags: ['生日', '合唱', '欢快'],
    bpm: 100, meter: 3, tonic: 60, pickup: 1, style: 'waltz',
    melody: `5,_ 5,_ | 6, 5, 1 | 7,- /
             5,_ 5,_ | 6, 5, 2 | 1- /
             5,_ 5,_ | 5 3 1 | 7, 6, /
             4_ 4_ | 3 1 2 | 1--`,
    chords: 'C|G|G|C|C|F|C,G|C',
    lyrics: `今天是你生日
             烛光照亮了你
             朋友们都在这里
             愿你天天快乐`,
  },
  {
    id: 'b:kuailai',
    title: '快来唱歌',
    origin: '旋律：法国民谣《Frère Jacques》（公版）',
    lang: '国语',
    tags: ['儿歌', '欢快', '轮唱'],
    bpm: 116, meter: 4, tonic: 62, pickup: 0, style: 'kids', repeat: 2,
    melody: `1 2 3 1 | 1 2 3 1 / 3 4 5- | 3 4 5- /
             5_ 6_ 5_ 4_ 3 1 | 5_ 6_ 5_ 4_ 3 1 / 1 5, 1- | 1 5, 1-`,
    chords: 'C|C|C|C|C|C|C|C',
    lyrics: `快来唱歌快来唱歌
             拿话筒拿话筒
             左边唱完右边大家一起来唱
             真开心真开心`,
  },
  {
    id: 'b:heiha',
    title: '嘿哈之夜',
    origin: '旋律：《Jingle Bells》J. Pierpont 1857（公版）',
    lang: '国语',
    tags: ['嗨歌', '欢快', '热场'],
    bpm: 128, meter: 4, tonic: 62, pickup: 0, style: 'march', repeat: 2,
    melody: `3 3 3- | 3 3 3- | 3 5 1. 2_ | 3--- /
             4 4 4. 4_ | 4 3 3 3_ 3_ | 3 2 2 3 | 2- 5- /
             3 3 3- | 3 3 3- | 3 5 1. 2_ | 3--- /
             4 4 4. 4_ | 4 3 3 3_ 3_ | 5 5 4 2 | 1---`,
    chords: 'C|C|C|C|F|C|D7|G|C|C|C|C|F|C|G|C',
    lyrics: `嘿嘿嘿哈哈哈欢乐的夜晚
             音乐响起大家一起摇不要害羞唱吧
             嘿嘿嘿哈哈哈快乐到天亮
             一首一首唱不完的歌今晚我们嗨`,
  },
  {
    id: 'b:huaxiang',
    title: '小院花香',
    origin: '旋律：江苏民歌《茉莉花》（公版）',
    lang: '国语',
    tags: ['民歌', '中国风', '抒情'],
    bpm: 66, meter: 4, tonic: 62, pickup: 0, style: 'folk',
    melody: `3 3_ 5_ 6_ i_ i_ 6_ | 5 5_ 6_ 5- /
             3 3_ 5_ 6_ i_ i_ 6_ | 5 5_ 6_ 5- /
             5 5 5 3_ 5_ | 6 6 5- /
             3 2_ 3_ 5 3_ 2_ | 1 1_ 2_ 1- /
             2 3_ 5_ 2_ 3_ 1_ 6,_ | 5,---`,
    chords: 'C|C|C|C|C|F,C|C|C|G|C',
    lyrics: `晚风吹过小小庭院里~~
             花香飘进我们歌声里~~
             朵朵洁白~又芬芳
             让我~轻轻~唱给~你
             愿你~天天都~好`,
  },
  {
    id: 'b:gelao',
    title: '古老的歌谣',
    origin: '旋律：英格兰民歌《Greensleeves》（公版）',
    lang: '国语',
    tags: ['抒情', '怀旧'],
    bpm: 100, meter: 3, tonic: 67, pickup: 1, style: 'waltz',
    melody: `6, | 1- 2 | 3. 4_ 3 | 2- 7, | 5,. 6,_ 7, | 1- /
             6, | 6,. #5,_ 6, | 7,- #5, | 3,- /
             6, | 1- 2 | 3. 4_ 3 | 2- 7, | 5,. 6,_ 7, /
             1. 7,_ 6, | #5,. #4,_ #5, | 6,--`,
    chords: 'Am|C|G|Em|Am|E|E|Am|C|C|G|Em|Am|E|Am',
    lyrics: `古老的歌谣在夜里轻轻地唱
             唱给远方的你听
             多少往事随风去了只剩下
             心中那首老歌谣`,
  },
  {
    id: 'b:zhoumo',
    title: '周末派对',
    origin: '旋律：英国童谣《London Bridge》（公版）',
    lang: '国语',
    tags: ['嗨歌', '儿歌', '热场'],
    bpm: 120, meter: 4, tonic: 60, pickup: 0, style: 'pop', repeat: 2,
    melody: `5. 6_ 5 4 | 3 4 5- / 2 3 4- | 3 4 5- /
             5. 6_ 5 4 | 3 4 5- / 2- 5- | 3 1--`,
    chords: 'C|C|G|C|C|C|G|C',
    lyrics: `周末夜晚来唱歌
             来唱歌来唱歌
             叫上朋友一起来
             嗨翻全场`,
  },
];
