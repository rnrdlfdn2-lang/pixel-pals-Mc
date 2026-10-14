// 던지기 아이템 도트(똥/폭탄/매직미사일/저격총): 업로드한 그림을 변환한 데이터 (tools/make_items.py)
// 화염방사기/사무라이 칼/게틀링건(flamer/katana/gatling)은 업로드한 그림을 변환 (tools/make_weapons3.py)
// 마왕의 스태프(staff)는 업로드한 그림을 변환 (위로 곧게 세운 모양, forward -90)
// 무기(cannon/axe/bow/glove)는 tools/make_weapons.py 로 직접 그린 도트. bow.tips = 시위를 거는 두 끝, grip = 손잡이
// forward: 앞쪽(총구/불꽃의 머리)이 향하는 각도(도). pivot: 총을 들었을 때 손잡이 위치, muzzle: 총구 위치, fuse: 폭탄 도화선 끝 (모두 도트 칸 단위)
(function (root) {
  root.ItemSprites = {
 "poop": {
  "palette": {
   "a": "#b47449",
   "b": "#ad6e44",
   "c": "#9e643c",
   "d": "#915a35",
   "O": "#262626",
   "E": "#262626",
   "W": "#ffffff"
  },
  "rows": [
   "...........O.........",
   "..........OaO........",
   ".........ObaaO.......",
   ".......OObaaab.......",
   "......ObbbaaabO......",
   ".....ObcdbaaacbO.....",
   "....ObabaaaaaaaaO....",
   "....Oaaaaaaaaaaab....",
   "....OdaaaaaaaaaaO....",
   "..ObabaaaaaaabcdOOO..",
   "..babaaaaaaaaabaaabO.",
   "..bbcaaaaaaaaaaaaaaO.",
   "..OaaaEaaaaaaaaEaaab.",
   ".OaaaaEaaaaaaaaEaaaO.",
   "OaaaaaaaaaaaaaaaaabbO",
   "OacbaaaaaEaEaaaaadcaO",
   "OaadbaaaaaEaaaaaaaaaO",
   ".OaaaaaaaaaaaaaaaaaO.",
   "..OOaaaaaaaaaaaaaOO..",
   "....OOOOOOOOOOOO....."
  ],
  "forward": 0
 },
 "bomb": {
  "palette": {
   "a": "#f3b362",
   "b": "#94939e",
   "c": "#b79365",
   "d": "#818082",
   "e": "#66656c",
   "f": "#4e4d51",
   "O": "#262626",
   "E": "#262626",
   "W": "#ffffff"
  },
  "rows": [
   "................O..",
   "...............OO..",
   "............OcOOaaO",
   "...........OcOOcaO.",
   "..........OaO..OOaO",
   "........OOOO...OO..",
   ".......OdddOO......",
   ".....OOOddddO......",
   "...OffffOOOOO......",
   "..OfedfffffffO.....",
   ".OfebbffffffffO....",
   ".Ofbbffffffffff....",
   "OffeeffffffffffO...",
   "OfeefffffffffffO...",
   "OfdefffffffffffO...",
   "OffffffffffffffO...",
   "OffffffffffffffO...",
   ".Offfffffffffff....",
   ".OffffffffffffO....",
   "..OffffffffffO.....",
   "...OOffffffOO......",
   ".....OOOOOO........"
  ],
  "forward": -45,
  "fuse": [
   17,
   3
  ]
 },
 "missile": {
  "palette": {
   "a": "#f6f5f7",
   "b": "#e7d8f9",
   "c": "#dbc1fb",
   "d": "#c7b1fb",
   "e": "#979bfb",
   "f": "#9a8afa",
   "O": "#262626",
   "E": "#262626",
   "W": "#ffffff"
  },
  "rows": [
   "...............OOOO",
   "..............OeeOO",
   ".............Oeee..",
   ".............OeeO..",
   "..........OO.OeeO..",
   ".....OOOeeeOOeeeO..",
   "....Offfeeeeedee...",
   "..OOfdfdcdeedeeO...",
   ".OffdcccccccceO....",
   ".OfccbbacccdeeO....",
   "OfdbaaabcceeeO.....",
   "OfcaaaabcceeO......",
   "Ofbaaaabccee.......",
   "OfdaaabccefO.......",
   ".OfdcccdffO........",
   "..OfffffOO.........",
   "....OOOO..........."
  ],
  "forward": 142.5
 },
 "gun": {
  "palette": {
   "a": "#e8e8e8",
   "b": "#8b91db",
   "c": "#75785a",
   "d": "#656564",
   "e": "#585a49",
   "f": "#4e4e4e",
   "O": "#262626",
   "E": "#262626",
   "W": "#ffffff"
  },
  "rows": [
   ".............OO...........",
   ".......OO..Offb........OfO",
   ".......OfOOfffb.....OOOffO",
   "...OOfOfffOOOOOOOOOffOOOO.",
   "...OffOOOOaaOOcccOOO......",
   "....OOOOOOcccccccO........",
   "...O..ceeeccccOOOO........",
   "OOccOOccccccO...OO........",
   "eccccccOOOO.....OO........",
   "fccccOOdO.......Of........",
   "fccccO.O........OfO.......",
   "feOOO............O........",
   "OO........................"
  ],
  "forward": -15,
  "pivot": [
   9,
   8
  ],
  "muzzle": [
   25,
   1
  ]
 },
 "cannon": {"palette": {"a": "#7f8a50", "h": "#aab36b", "b": "#626b3e", "g": "#8b9a55", "k": "#c5cf8d", "r": "#d04a3b", "e": "#4a4a4e", "f": "#2f2f33", "O": "#262626"}, "rows": ["...........OOOO...................", "..........OeeeeO..................", "...........OeeO...................", "..OOO....OOOeeO...OO...OOOOO......", ".OeeeOOOOeeOeeOOOOeeOOOrrgggOO....", ".OeeefaaaeeaaaaaaaeeaaarrkkgggOO..", ".OefffhhheehhhhhhheehhhrrggkkgggO.", ".OefffahheehhhhaaaeeaaarrgggggggO.", ".OefffaaaeeaaaaaaaeeaaarrgggggggO.", ".OefffaaaeeaaaaaaaeeaaarrgggggggO.", ".OefffbbbeebbbbbbbeebbbrrgggggOO..", ".OeeefOOOeeeOOeeeOeeOOOrrgggOO....", ".OeeeO...OeeOOefeOOO...OOOOO......", "..OOO....OeeOOefeO................", "..........OO.OefeO................", ".............OeeeO................", "..............OOO................."], "forward": 0, "pivot": [15, 13], "muzzle": [32, 7]},
 "axe": {"palette": {"a": "#e4e6ea", "b": "#e0a063", "c": "#8b8e96", "d": "#b9703b", "e": "#5a463a", "O": "#262626"}, "rows": ["......................", "...........O..O.......", "..........OeOOcOOO....", "........OOeecaaaccOOO.", ".......OeeeeeccccccccO", ".......OeeeeecccccaaaO", ".......OeeeeccccccaaaO", ".......Oeeeeccccccaaac", "........OOecccccccaaac", "........Oddbccccccaaac", ".......Oddbddcccccaaac", "......OdeeedOOOOOcaaaO", "......OdeeeO....OcaaaO", ".....OeeeeeO....OcaacO", "....OdeeeOO......OacO.", "...OeeeeeO.......OccO.", "..OdeeedO........OcO..", ".OddeeeO..........O...", "..OdddO...............", "...OdO................", "....O.................", "......................"], "forward": -45, "pivot": [6, 15]},
 "bow": {"palette": {"b": "#e0a063", "d": "#b9703b", "e": "#5a463a", "O": "#262626"}, "rows": ["OeedO.........", "OeeddO........", "OdddddO.......", ".OdddddO......", "..OdddbdO.....", "...OOOdbdO....", ".....OdbddO...", ".....OddbddO..", "......OddbddO.", ".......OddbdO.", "........OdbdO.", "........OeeeeO", "........OeeeeO", "........OeeeeO", "........OeeeeO", "........OeeeeO", "........OeeeeO", ".......OddbdO.", "......OddbddO.", "......OdbddO..", ".....OdbddO...", "...OOddbdO....", "..OddddddO....", ".OddddddO.....", ".OddddOO......", ".OdddO........", "OeedO.........", "OeeO.........."], "forward": 0, "pivot": [11, 14], "tips": [[2, 1], [2, 26]], "grip": [11, 14]},
 "glove": {"palette": {"a": "#e8b730", "h": "#ffe27a", "b": "#b5811a", "p": "#3fd0c9", "q": "#ff5fa2", "r": "#ff8a1c", "z": "#a98bff", "w": "#ffffff", "O": "#262626"}, "rows": ["........................", "............OOOOO.......", "..........OOaaaaaOO.....", "...O.O.OOOaawppaaaaOOO..", ".OObObOhhhhhppphhhbbbbO.", "OhhbhbhhhhhhppphhhbbbbO.", "OhhbhbhhaaaaaaaaaaaaaO..", "OazzzbaaaaaawqqaaabbbbO.", "OzzzzzaaaaaaqqqaaabbbbO.", "OzzzzzaaaaaaqqqaaaaaaaO.", "OzzzzzaaaaaaaaaaaabbbbO.", "OazzzbaaaaaawrraaabbbbO.", "ObbbbbbbaaaarrraaaaaaO..", "ObbbbbbbbbbbrrrbbbbbbO..", ".OObObOObbbbbbbbbbbbbO..", "...O.O..OOOOaaaaaOOOO...", "............OOOOO.......", "........................"], "forward": 0, "pivot": [4, 9]},
 "gatling": {"palette": {"0": "#dab879", "1": "#9d8044", "2": "#79684e", "3": "#63604c", "4": "#645741", "5": "#565448", "6": "#52473b", "7": "#46433e", "8": "#413c35", "9": "#3a3631", "a": "#32312f", "b": "#302e2c", "c": "#2e2c2b", "d": "#2b2b2a", "e": "#292928", "f": "#272727", "g": "#262626", "h": "#252525"}, "rows": [".................eedf.................................", "...........cddfg99e8be................................", ".........8e9411002b78g................................", "........ffg1000001d77g................................", ".......fa7e0000111f87g................................", ".......f77g111269bgabg................................", "......gc79ggge5212e6ae................................", "......9b7c20000000f5ae................................", "......e97g00000000g6aa................................", "......h88b00023300g79a...ca...........................", "......f7a500dbab92gaegggdadb.............effgggga.....", ".....db7d105a798ea998777755g............g64e58gaagcg..", ".....f97g00g887aa57778aaa75g...eggddddggb0473ae57c59d.", ".....g88g07fda7adaeggg86bc7eade41fb8755920b55fc9c5eaa.", "....9gcgge977g8f9755g218ga9878904833333c10g77gf7778aa.", ".fgf9753222329dd3327802e22222720ca8aefdg01d78geb997fb.", "e7322222222637g7333a109f789bgg11g775535c01b79e98a5779d", "d3532222222337b3333g11g733553d11d335357a01b79d59d968ae", "e553222233235cda879d12a222333g11e9beggg901b79d7ccd77bf", "g8335679cggfb212g99914d79afggg01ggggggg901c79d57fa758d", ".dgf88bbdfb44118gee814gggggggg11g987755d01d78gcad57gf.", "..ae14afaea46ggga8b914ga77755e11b222222g01g77gdd7cde5.", ".e9731112g101118b889149222222b11e335557f10g77ea77998f.", "fb5821112g12448f888d12b355778d21gggggggg20897ae7gabag.", "b86821113gb988bf844g11gggeca9a618b553327804a78g7799ag.", "c84422226e420006b44c419e322223c12b223335g11f77dg8g89f.", "c84444446g66449g6449912g555778g419egggggg919dbdgggfe..", "d94444444deb98ag9448g64bgggcdadgbegc.....afcdbcb......", "g94444444g641001g588e8aa9fge..........................", "c94444444d86646g9688g69dgggf..........................", "ab44324447ggdecfeabggaeggggc..........................", "ge4f324448a640006gggg...gge...........................", ".g67434468c66216gggga.................................", ".edabegggggggggggga...................................", "...hg.....ae884114h...................................", "...........e64101bb...................................", "...........fbafggbag..................................", "............ec96100bd.................................", "............eb4644cfbh................................", ".............edee8101ebd..............................", "..............bb4244d418d.............................", "...............e88b6801ca.............................", "................ega6c9ga..............................", "..................aaba................................"], "forward": 0, "pivot": [14, 18], "muzzle": [53, 18]},
 "flamer": {"palette": {"0": "#a38a62", "1": "#836956", "2": "#78563f", "3": "#504c48", "4": "#c93b27", "5": "#ac3a27", "6": "#45403d", "7": "#3c3937", "8": "#742f25", "9": "#372f2d", "a": "#302f2f", "b": "#2d2c2c", "c": "#2d2929", "d": "#292929", "e": "#272727", "f": "#292626", "g": "#262626", "h": "#252525"}, "rows": [".................bdbba........................", "................bc2226gb......................", "................e9200002g.....................", ".................eg60227b.....................", "................d1a20gbd......................", "...........gddag989cgg3.......................", ".........af858f54444589d......................", ".........g504c8444044448g.....................", "........d8045g5444444444cg....................", "........d8448944444444449h....................", ".......ge988984448885444ca....................", "......ea337bgc888d6ae859gb..ga7...............", "......d73336679bg7337cf23fgga369dggbeab.......", "....dgga63366666d333ag20237b0171001137gdbbaege", "...g77gcfb976667g313eg0023b3013000g30bbc27g22.", "..g337d8488ggdaaa113gg0036g1000330103cb107610.", ".h639eg54458588c7116gg2266g0010a3000cac00e21..", "ab37gaf044554449311777bdggg03e000101gc602921..", "ga6b31904485445g331d633366g111001g31da20662...", "d76e0a804484445g363ggda766agd7311111da20962...", "g76e1g544584445ga67ggg9adgcdgc9gge77ge61962...", "da6agg84455444458cggg7366g3c822g..ag66bggg....", "de66dgdc885444448c9ea136caac9fce...g766e......", ".db7d117gg84444897db133ab..b848g....abe.......", "..ee613dgg9889fc77g3337d...d848d..............", "...g317a7779979gae7366ea...b845b..............", "...ad6ba7766767gga336ba....b848a..............", ".....dgdgbaaabdg9c737d.....b845g..............", ".........ddgdgge206eg7.....b99fb..............", "................e62fa.......bb................", ".................gea.........................."], "forward": 0, "pivot": [24, 16], "muzzle": [46, 16]},
 "katana": {"palette": {"0": "#f1f1f1", "1": "#ededed", "2": "#dddddd", "3": "#bdbdbf", "4": "#aaaaae", "5": "#a4a4a8", "6": "#a38d6b", "7": "#93713c", "8": "#635e56", "9": "#703a27", "a": "#4b3d34", "b": "#3b3533", "c": "#32302f", "d": "#2d2b2a", "e": "#292929", "f": "#282828", "g": "#272727", "h": "#262626"}, "rows": [".efec............gge............................................", "c97fbhghhffdfeccb77a............................................", "e77c8eddbgbgdffdha67f....................................dfeeaag", "d77bag99d9e9fbbdac77eed..........................hddefca8863118.", "d79bbh99b9h9f99d9c7979888abchggeehhheefeffghdbba88865544443018e.", "..9cdcdccdccd9db9d7a77542232455565555555555444444444444431028g..", ".....gehhhdhchcd9a7c773443444445444444444444444443343112004be...", "............geche97d7811002211232233213321232012100001358bg.....", "...............d777egfga88654332210000000000222335688bgef.......", "...............f77a.......gdgffdhfhcbbbbbbfhefdfgfe.............", "................egb............................................."], "forward": 0, "pivot": [10, 5], "muzzle": [62, 2]},
"staff": {"palette": {"F": "#171514", "n": "#825f38", "d": "#e2aa4b", "B": "#323231", "l": "#976c36", "b": "#e6cd91", "h": "#b38541", "z": "#533823", "C": "#30251d", "x": "#6c432f", "c": "#dfbd6f", "a": "#eedfb3", "j": "#b07336", "o": "#7c4f2e", "e": "#c5a66b", "g": "#ca8744", "q": "#554e46", "p": "#4f617a", "G": "#13100e", "f": "#ce9646", "A": "#54291d", "u": "#a32f2c", "t": "#cc2f34", "w": "#a41f27", "J": "#0b0808", "D": "#271b14", "s": "#d83d3f", "k": "#d05749", "v": "#a8252a", "m": "#925f38", "r": "#ea4042", "I": "#0c0b0a", "y": "#52422d", "L": "#030303", "E": "#1d1b18", "H": "#100d0b", "i": "#708ba9", "K": "#060605"}, "rows": ["................F...............", "...............ndnB.............", "...............lbhz.............", ".............CxcadjC............", "...........oecdbbddhl...........", "...........CjnjccgjloF..........", "............Bqzhcjzzpq..........", "...........Gbbhbbflhzp..........", "..........occhnxelhdch..........", ".......x.zhdAxutwwAxdclJzC......", "......GenflDwskstvvvzgdmdx......", "...Gq.ofhfxtt.krrvvtvAddgo......", "..zdnqeoflus...rrsvvtAlgmG.IF...", ".FfdgznjcAt....rrtwwvwofjFJlfz..", "Fhbbddmexut...rrrvwwvtAdnAoddly.", "LhcdfgjehwssrkrrtwwwvrAfgfcbbdgE", ".xgdjxxhdArvvsstwwvvssodlmjgfjoD", ".CzglBBmcAssvvvvwvtsrulflCzhjoF.", "..JjC.qzdmutttvvttrkrwlhz.GjzI..", "...GH.BDlfjurrrsrkkkADflC.JzD...", "......BppqhhAktrrkkxmflzq..J....", ".....BiaiipfdxngxAxolojjoB......", "....EpaaiipqjfccdfhlodcdgjG.....", "....IpiiiipyoofcjmxzfaaddjD.....", ".....BiiiiBlhobcjoxngbcddjy.....", "......Biip.ybladlxpylddddo......", ".......BFE.CymbdoAn.ClfdlE......", "...........gffegdhz..CzDG.......", "...........zmlfjooz.............", "............DjhfjD..............", "............CpipqC..............", "............yiaipoJ.............", "...........EiiaipmH.............", "...........Ilpipqo..............", "............BmpllA..............", "............CjfjxJ..............", "............GohoF...............", "............GhcfC...............", "............InhoC...............", ".............zxAI...............", "............EmnyL...............", "............EnlxG...............", "............BxloD...............", "............Blmxz...............", "............GmozJ...............", "............LmnxK...............", ".............xmxF...............", ".............xmxC...............", "............DhmxC...............", "............JmnxG...............", "............LxnxD...............", ".............zmxC...............", "............yomxC...............", "............JooxF...............", "............JxxxD...............", "............IznxCG..............", ".............DxyC...............", "............DjlmD...............", "............Ifbfz...............", "............DlfmzD..............", "...........HldcfgC..............", "...........ygghogzC.............", "...........lgmuvAjz.............", "..........FcxaesvjoK............", "..........Hhjeetvmo.............", "...........yndstujD.............", "............DdkkjC..............", "............FndjzB..............", ".............Jooq...............", "..............qI................"], "forward": -90, "pivot": [14, 45], "muzzle": [16, 5]}
};
})(typeof window !== 'undefined' ? window : globalThis);
