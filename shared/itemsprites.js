// 던지기 아이템 도트(똥/폭탄/매직미사일/저격총): 업로드한 그림을 변환한 데이터 (tools/make_items.py)
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
 }
};
})(typeof window !== 'undefined' ? window : globalThis);
