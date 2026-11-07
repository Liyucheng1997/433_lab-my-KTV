# 我的KTV

在浏览器里开一间 KTV 包厢：点歌、原唱/伴唱切换、升降调、麦克风混响回声、变声、音准打分、录音，外加旋转灯光、迪斯科球和气氛音效。纯前端实现，不需要后端。

```bash
npm install
npm run dev        # http://localhost:5188
npm run build      # 输出到 dist/，可直接放到任何静态网站托管（相对路径）
```

麦克风需要 `localhost` 或 HTTPS 环境。建议戴耳机唱，外放容易啸叫。

## 功能

| 模块 | 说明 |
| --- | --- |
| 包厢环境 | 软包墙面、沙发茶几剪影、旋转光束、迪斯科球光斑，跟着音乐律动；五种灯光（柔光 / 动感 / 派对 / 浪漫 / 关灯） |
| 点歌台 | 歌名、歌手、**拼音首字母**（qt = 晴天）和全拼搜索，屏幕拼音键盘；推荐榜、语种和标签筛选、歌手页、收藏、已点（置顶 / 删除 / 随机）、已唱记录 |
| 播放控制 | 播放 / 暂停、切歌、重唱、原唱 / 伴唱、升降调 ±6、进度跳转、伴奏 / 人声 / 气氛三路音量 |
| 歌词 | KTV 双行交替显示、逐字变色、长间奏倒数提示，支持歌词偏移微调 |
| 麦克风 | 均衡、压缩、混响、回声；六种场景预设（原声 / KTV / 录音棚 / 演唱会 / 空旷山谷 / 浴室）；变声（大叔 / 少女 / 萌娃 / 怪兽 / 机器人）；耳返开关、选择输入设备 |
| 打分 | 有音高数据的歌显示滚动音高轨道和实时音高线，按音准打分（不计八度，金色音符双倍）；每句给出 PERFECT / GREAT / GOOD 评价，唱完显示总分和等级。只有歌词的歌按演唱完整度打分 |
| 气氛 | 掌声、欢呼、口哨、礼炮、鼓声、笑声，全部实时合成；高分自动撒彩带 |
| 录音 | 录下伴奏 + 人声 + 音效，保存在浏览器里，可回放和下载 |

快捷键：空格 播放/暂停 · N 切歌 · R 重唱 · S 点歌 · V 原唱/伴唱 · M 开关麦 · ↑↓ 升降调 · F 全屏 · Esc 关闭面板

## 曲库来源

| 来源 | 数量 | 能做什么 |
| --- | --- | --- |
| **内置曲目** `src/data/builtin-songs.js` | 10 首 | 公版旋律（欢乐颂、小星星、茉莉花、友谊地久天长、绿袖子等）+ 本项目原创填词，伴奏由 Web Audio 实时合成。完全离线，支持导唱、移调、打分 |
| **开源曲库** [UltraStar-Deluxe/songs](https://github.com/UltraStar-Deluxe/songs) | 39 首 | 知识共享（CC）授权的卡拉OK歌曲，带真实音频、逐字时间和音高数据，7 首有独立伴奏音轨。在线从 GitHub 加载 |
| **本地歌库** | 不限 | 选择音乐文件夹（浏览器会记住授权）或添加单个文件。读取 ID3 / FLAC 标签，同名 `.lrc` 自动当歌词，没有就去 LRCLIB 匹配。伴唱用消人声，KTV 双声道文件可改成左 / 右声道伴奏 |
| **在线歌词** [LRCLIB](https://lrclib.net) | 数百万首 | 免费开放的同步歌词库，无需密钥，中文歌很全。没有伴奏时进入清唱模式 |
| **在线 KTV 视频** | 不限 | 给任意歌曲绑定 B站 / YouTube 视频链接（官方嵌入播放器），下次点歌直接播放；YouTube 视频会叠加同步歌词 |
| **热门目录** `src/data/catalog.js` | 约 280 首 | 只有歌名和歌手。点歌时依次匹配：本地同名歌曲 → 已绑定视频 → LRCLIB 歌词清唱 |

### 关于“开源 KTV 歌库”

流行歌曲的伴奏和歌词都有版权，网上没有能合法直接接入的“全量 KTV 曲库”。这个项目采用的组合是：

- 能合法内置的：公版旋律和 CC 授权曲目（上面两项）。
- 歌词：接入开放的 LRCLIB。
- 伴奏：用你自己的音乐文件（消人声或双声道切换），或者绑定在线视频平台的官方嵌入播放器。

类似的开源项目可以参考：[AllKaraoke](https://github.com/Asvarox/allkaraoke)（网页 K 歌游戏）、[Karaoke Eternal](https://github.com/bhj/KaraokeEternal)（自托管点歌，支持 MP3+G）、[PiKaraoke](https://github.com/vicwomg/pikaraoke)、[Performous](https://github.com/performous/performous)、[UltraStar Deluxe](https://github.com/UltraStar-Deluxe/USDX)。

### 开源曲库离线 / 加速

- 国内访问 GitHub 慢时，可以在「设置 → GitHub 加速」填一个加速前缀。
- 也可以下载到本地：`npm run download:opensongs`（约 290MB，存到 `public/opensongs/`），然后在设置里勾选「开源曲库使用本地副本」。
- 更新曲库索引：`npm run index:opensongs`。

## 目录结构

```
src/
  main.js                界面装配、控制条、弹出面板、主循环
  ktv.js                 包厢控制器：队列、播放、打分、录音
  library.js             歌库汇总、拼音检索、点歌解析
  audio/engine.js        音频总线、混响冲激响应
  audio/worklets.js      AudioWorklet 实时变调（升降调 / 变声）
  audio/mic.js           麦克风效果链与音高检测
  audio/sfx.js           气氛音效合成
  players/               合成伴奏 / 音频视频 / 嵌入视频 / 清唱计时播放器
  lyrics/parse.js        LRC（含逐字）与 UltraStar 格式解析
  sources/               内置、开源曲库、本地歌库、LRCLIB
  ui/                    包厢场景、歌词、音高轨道、点歌台
  data/                  内置曲谱、热门目录、开源曲库索引
```

### 添加内置曲目

在 `src/data/builtin-songs.js` 里用简谱写旋律（`1-7` 音级，`_` 减半时值，`-` 延长一拍，`.` 附点，`'` `,` 升降八度，`/` 换行），歌词一字一音，`~` 表示拖腔，和弦按小节写。只放公版旋律和自己写的歌词。
