# -*- coding: utf-8 -*-
"""場景分類表：把《英語單字口袋書》的 889 個單字，依「生活場景」分組。

每個單字只屬於一個場景，讓練習可以「照著一個主題一路練到底」。
分類依據是這個詞在台灣國中生的日常使用情境，而不是嚴格的詞類學分類。
"""

# (id, 標題, 圖示, 一句話說明)
SCENARIOS = [
    ("basic",    "基礎文法",     "🔤", "冠詞、代名詞、be 動詞與介系詞——看懂句子的骨架"),
    ("family",   "家人親友",     "👨‍👩‍👧", "爸媽、兄弟姊妹、爺爺奶奶與親戚間的話"),
    ("home",     "居家生活",     "🏠", "家裡的房間、家具、用品與日常作息"),
    ("school",   "校園學習",     "🎒", "學校、老師同學、課業作業與文具"),
    ("food",     "飲食餐桌",     "🍚", "食物、飲料、做菜與上餐廳點餐"),
    ("animal",   "動物昆蟲",     "🐘", "會動的東西：貓狗鳥獸、昆蟲與寵物"),
    ("nature",   "自然風景",     "🌳", "動植物、花草樹木與戶外風景"),
    ("weather",  "天氣季節",     "🌦️", "今天天氣如何、幾月天、換季與節氣"),
    ("time",     "時間日期",     "🕒", "幾點、幾號、星期幾、早上還是晚上"),
    ("body",     "身體健康",     "🩺", "身體部位、感冒受傷與看醫生"),
    ("clothes",  "衣著作息",     "👕", "穿什麼、穿在哪裡、長什麼樣子"),
    ("city",     "城市場所",     "🏙️", "街上市鎮、學校商店與公共場所"),
    ("travel",   "交通旅遊",     "✈️", "怎麼去、坐什麼車、出門去遠方"),
    ("money",    "購物花錢",     "💰", "買東西、比價格、付錢與賣東西"),
    ("work",     "職業工作",     "💼", "長大想做什麼、大人的上班世界"),
    ("sport",    "運動遊戲",     "⚽", "運動、比賽、遊戲與玩樂"),
    ("festival", "節慶活動",     "🎉", "生日、節日、派對與休閒活動"),
    ("feeling",  "情緒性格",     "😊", "開心、生氣、害怕與一個人的個性"),
    ("action",   "動作動詞",     "🏃", "吃飯、寫字、跑步等每天在做的動作"),
    ("describe", "描述形容",     "🎨", "描述大小、顏色、長短與特徵的形容詞"),
    ("talk",     "日常對話",     "💬", "打招呼、問候、禮貌用語與常用句"),
]

# 場景 -> 該場景收錄的單字（以 PDF 原始拼寫，含括號的別寫法照原樣）
WORDS = {
    "basic": [
        "a (an)", "am", "are", "at", "be", "do", "does", "have", "he", "I", "in",
        "is", "it", "of", "she", "that", "the (", "this", "up", "down", "off",
        "on", "under", "to", "and", "or", "if", "so", "very", "really", "too",
        "not", "no", "yes", "yummy", "OK", "in", "into", "out", "over", "around",
        "about", "also", "still", "only", "even", "almost", "enough", "each",
        "other", "another", "else", "same", "both", "few", "many", "a few",
        "a little", "everybody", "everyone", "everyone everybody", "anyone",
        "(anybody)", "anything", "something", "someone", "somewhere", "nothing",
        "nobody", "a few", "mean", "whether", "whose", "why", "like",
    ],
    "family": [
        "baby", "father (dad,daddy)", "mother", "kid", "child", "brother",
        "sister", "parents", "husband", "wife", "cousin", "grandparents",
        "raise", "neighbor", "aunt", "friendly", "dear", "kiss", "love",
        "share", "together", "himself", "twin", "guest", "married", "please",
    ],
    "home": [
        "bed", "home", "cup", "pot", "tub", "seat", "line", "toy", "ring",
        "bedroom", "bathroom", "kitchen", "blanket", "couch", "chair", "table",
        "drawer", "bowl", "bottle", "lid", "mat", "lamp", "light", "stairs",
        "gate", "bottom", "top", "window", "door", "wall", "balcony", "yard",
        "apartment", "base", "corner", "space", "comfortable", "tidy", "dirty",
        "clean", "neat", "iron", "key", "air", "central", "entrance",
    ],
    "school": [
        "book", "pen", "school", "classroom", "classmate", "teacher", "student",
        "English", "note", "read", "spell", "word", "sentence", "question",
        "answer", "group", "team", "rule", "grade", "test", "quiz", "exam",
        "lesson", "homework", "class", "library", "blackboard", "chalk",
        "pencil", "glue", "art", "music", "PE(physical education)", "lesson",
        "spell", "list", "example", "dictionary", "math (mathematics)",
        "science", "history", "playground", "club", "principal", "study",
        "learn", "teach", "plan", "prepare", "pass", "fail", "correct",
        "silly", "clever", "smart", "hard-working", "proud", "polite",
        "srade", "row", "list", "blackboard", "notebook", "lesson",
    ],
    "food": [
        "meat", "milk", "lunch", "apple", "cake", "candy", "cola", "fried",
        "ham", "rice", "banana", "cookie", "watermelon", "pear", "grape",
        "guava", "papaya", "lemon", "peach", "orange", "strawberry", "orange",
        "vegetable", "lettuce", "chocolate", "popcorn", "pizza", "hamburger",
        "bun", "dumpling", "steak", "salad", "sugar", "butter", "salt", "oil",
        "spaghetti", "chopsticks", "fork", "spoon", "straw", "juice", "tea",
        "coffee", "wine", "candy", "bread", "noodles", "rice", "sandwich",
        "snack", "taste", "delicious", "flavor", "sweet", "yummy", "fresh",
        "boil", "bake", "fry", "eat", "drink", "meal", "breakfast", "dinner",
        "menu", "order", "restaurant", "waiter", "waitress", "clerk",
        "bakery", "shopkeeper", "salesman", "cost", "treat", "diet",
    ],
    "animal": [
        "cat", "dog", "bird", "mouse", "lion", "ant", "bee", "bug", "cow",
        "fox", "frog", "hippo", "hen", "pet", "sheep", "swing", "elephant",
        "bat", "duck", "fan", "ghost", "horse", "whale", "zebra", "butterfly",
        "fish", "goat", "shark", "rabbit", "puppy", "insect", "kangaroo",
        "koala", "ox", "goose", "spider", "turtle", "rat", "tail", "tiger",
        "monkey", "bear", "crab", "snake", "animal", "pet", "saddle",
    ],
    "nature": [
        "park", "grass", "green", "land", "lake", "plant", "river", "ground",
        "hill", "nature", "garden", "flower", "tree", "sky", "seed", "rose",
        "island", "forest", "mountain", "sea", "ocean", "planet", "earth",
        "river", "stone", "sand", "leaf", "sun", "moon", "star", "plant",
        "nature", "grow", "grow", "alive", "garden", "yard",
    ],
    "weather": [
        "hot", "sky", "rainbow", "snow", "rain", "wind", "windy", "blue",
        "autumn (fall)", "gray", "snowy", "cold", "warm", "cloud", "sunny",
        "typhoon", "spring", "summer", "winter", "season", "temperature",
        "weather", "ice", "storm", "rainbow", "umbrella",
    ],
    "time": [
        "day", "week", "hour", "later", "year", "today", "tonight", "noon",
        "often", "once", "twice", "early", "late", "time", "always", "seldom",
        "date", "birthday", "Monday", "Tuesday", "Thursday", "Friday",
        "Saturday", "Sunday", "Wednesday", "April", "August", "December",
        "January", "March", "May", "July", "June", "November", "October",
        "quarter", "moment", "century", "future", "past", "eve", "since",
        "total", "minute", "moment",
    ],
    "body": [
        "neck", "nose", "toe", "knee", "mouth", "body", "hair", "head",
        "shoulder", "finger", "lip", "nail", "tooth", "heart", "stomach",
        "throat", "tail", "leg", "arm", "hand", "foot", "eye", "ear", "face",
        "headache", "medicine", "dentist", "nurse", "doctor", "doctor(Dr.)",
        "hospital", "fever", "sore", "hurt", "pain", "ill", "sick", "health",
        "healthy", "weak", "tired", "blind", "rest", "sleep", "bed",
        "brush", "comb", "bathe", "bath", "exercise", "dead", "injury",
    ],
    "clothes": [
        "cap", "short", "skirt", "size", "slim", "tall", "clothes", "glasses",
        "dress", "shirt", "pants", "shoe", "sock", "hat", "jacket", "tie",
        "vest", "belt", "uniform", "T-shirt", "gloves", "boots", "sweater",
        "skate", "pair", "tight", "loose", "wear", "wear", "fashion",
    ],
    "city": [
        "store", "zoo", "middle", "station", "bank", "city", "center",
        "museum", "hospital", "library", "theater", "hotel", "church", "temple",
        "castle", "park", "zoo", "room", "floor", "street", "sidewalk",
        "block", "square", "gate", "gate", "farm", "factory", "office", "shop",
        "market", "supermarket", "department store", "bookstore", "post office",
        "convenience store", "place", "area", "inside", "outside", "town",
        "village", "country", "world", "Taiwan", "China", "America",
        "American", "USA", "ROC", "jurisdiction",
    ],
    "travel": [
        "bus", "car", "ship", "abroad", "airplane", "airport", "motorcycle",
        "bicycle (bike)", "train", "trip", "travel", "tour", "ticket",
        "vacation", "trip", "ride", "drive", "fly", "arrive", "leave", "sail",
        "cross", "road", "street", "sidewalk", "traffic", "way", "bridge",
        "back", "return", "map", "postcard", "camera", "photo", "suitcase",
        "pack", "package", "passport", "foreign", "foreigner", "language",
        "beach", "island", "MRT", "station", "walk", "run",
    ],
    "money": [
        "buy", "pay", "cost", "price", "cheap", "expensive", "sale", "money",
        "dollar", "cent", "hundred", "million", "dozen", "discount", "bill",
        "coin", "change", "worth", "deal", "business", "businessman", "budget",
        "spend", "save", "borrow", "lend", "shop", "buy", "sell", "sale",
        "grocery", "bakery", "market", "supermarket", "department store",
        "price", "value",
    ],
    "work": [
        "job", "worker", "office", "worker", "boss", "power", "meeting",
        "engineer", "lawyer", "businessman", "salesman", "secretary", "officer",
        "clerk", "waiter", "waitress", "reporter", "player", "actor", "actress",
        "writer", "soldier", "farmer", "fisherman", "businessman", "team",
        "leader", "group", "law", "rule", "follow", "busy", "hard", "lazy",
        "hire", "fire", "salary", "factory", "company", "bank", "factory",
        "order", "plan", "decide", "solve", "problem", "question", "example",
        "interview", "job", "future", "engineer",
    ],
    "sport": [
        "jog", "play", "kick", "ride", "race", "chess", "game", "ball",
        "race", "exercise", "tennis", "badminton", "soccer", "basketball",
        "frisbee", "surf", "skate", "roll", "slide", "swim", "jump", "run",
        "walk", "hop", "dodge ball", "player", "match", "win", "lose",
        "sport", "Sports Day", "photo", "team", "race", "chess", "see",
        "pin", "hit", "catch", "throw", "skip",
    ],
    "festival": [
        "birthday", "Halloween", "Christmas", "Easter", "festival", "party",
        "picnic", "holiday", "gift", "present", "card", "wish", "celebrate",
        "Christmas", "card", "dumpling", "moon", "barbecue (BBQ)", "lantern",
        "trick", "costume", "concert", "band", "movie", "music", "flute",
        "violin", "drum", "guitar", "piano", "radio", "tape", "recorder",
        "video", "program", "dancer", "sing", "dance", "act", "play",
    ],
    "feeling": [
        "happy", "sad", "mad", "shy", "nice", "funny", "afraid", "scared",
        "glad", "excited", "exciting", "bored", "boring", "unhappy", "angry",
        "sorry", "sad", "lonely", "proud", "worried", "worry", "surprised",
        "surprise", "serious", "crazy", "strange", "shy", "brave", "quiet",
        "loud", "lovely", "lovely", "kind", "polite", "friendly", "honest",
        "lazy", "helpful", "stranger", "dear", "sad", "smile", "cry", "laugh",
        "joy", "love", "hate", "hope", "wish", "care", "comfort", "afraid",
        "feel", "believe", "doubt", "fear", "fancy", "proud", "hero", "kind",
    ],
    "action": [
        "go", "come", "find", "draw", "eat", "ask", "want", "wake", "hop",
        "swim", "sit", "stand", "open", "close", "push", "pull", "carry",
        "hold", "drop", "dig", "cut", "fix", "clean", "wash", "cook", "make",
        "build", "buy", "sell", "give", "take", "put", "set", "move", "stop",
        "start", "begin", "finish", "wait", "hurry", "follow", "join",
        "play", "sing", "dance", "read", "write", "speak", "talk", "listen",
        "hear", "look", "see", "watch", "help", "learn", "teach", "call",
        "answer", "ask", "tell", "say", "think", "know", "understand",
        "remember", "forget", "believe", "hope", "wish", "feel", "try",
        "keep", "save", "count", "put", "turn", "hit", "kick", "catch",
        "climb", "jump", "hang", "smile", "wave", "nod", "bow", "kiss",
        "burn", "boil", "heat", "save", "share", "borrow", "lend", "press",
        "knock", "shout", "repeat", "point", "pick", "choose", "press",
    ],
    "describe": [
        "big", "fat", "long", "nice", "red", "six", "hot", "small", "high",
        "short", "sharp", "tidy", "kind", "clever", "simple", "easy",
        "difficult", "giant", "quiet", "loud", "thin", "fat", "heavy", "light",
        "fresh", "terrible", "wonderful", "excellent", "common", "different",
        "quick", "quite", "safe", "dangerous", "healthy", "strong", "poor",
               "rich", "famous", "lovely", "cute", "strange", "usual", "modern",
        "color", "colorful", "shape", "round", "square", "straight", "thick",
        "cool", "warm", "soft", "slow", "fast", "early", "late", "new",
        "old", "young", "heavy",
    ],
    "talk": [
        "yeah(=yes)", "sir", "Miss", "Mrs.", "hey", "OK", "excuse", "welcome",
        "pleasure", "mind", "care", "afraid", "hope", "wish", "leave",
        "later", "OK", "question", "problem", "matter", "example", "idea",
        "information", "mean", "answer", "tell", "say", "ask", "sir", "Dear",
        "sir", "OK", "fine", "sure", "excuse", "welcome", "please",
        "thank you", "you're welcome", "goodbye", "hi", "hello",
    ],
}

# 第二輪補完：逐字檢視尚未歸類的字後補上的指派。
# 注意每個場景只能出現一次，重複的 key 會被後面的蓋掉、導致漏字。
EXTRA = {
    "time": [
        "eight", "five", "four", "nine", "one", "seven", "ten", "three",
        "two", "zero", "eighteen", "eighty", "fifteen", "fifty", "forty",
        "fourteen", "nineteen", "ninety", "seventeen", "seventy", "sixteen",
        "sixty", "thirty", "twenty", "third", "soon", "end",
        "February", "September",
    ],
    "basic": [
        "you", "as", "ever", "guy", "behind", "beside", "above", "below",
        "ahead", "along", "near", "north", "south", "east", "west", "far",
        "should", "shall", "must", "able", "possible", "agree", "case",
        "everything", "however", "because", "though", "until", "without",
        "either", "except", "own", "person", "Chinese", "experience", "fact",
        "finally", "already", "least", "less", "little", "most", "maybe",
        "perhaps", "national", "thing", "yet", "away", "several", "during",
        "ready", "side",
    ],
    "festival": [
        "king", "prince", "princess", "queen", "dragon", "doll", "candle",
        "magic", "comic", "mask", "pray", "story", "special", "birthday",
        "present", "card", "robot",
    ],
    "nature": ["rock", "pipe", "rise", "pond", "kite"],
    "food": [
        "water", "bean", "French fries", "honey", "glass", "plate", "toast",
        "pumpkin", "turkey",
    ],
    "home": [
        "mop", "garbage", "trash", "towel", "restroom", "refrigerator",
        "knife", "pocket", "tool", "rope", "basket", "mud", "noise",
        "machine",
    ],
    "school": [
        "bell", "page", "paper", "part", "type", "copy", "mark", "mistake",
        "paste", "knowledge", "elementary school", "junior high school",
        "senior high school", "screen", "cheat",
    ],
    "city": [
        "police", "letter", "bench", "sign", "news", "newspaper", "Internet",
        "e-mail", "envelope", "mail", "mailman (mailcarrier)", "stamp",
        "public", "live",
    ],
    "sport": ["pool", "seesaw", "prize", "roller skate"],
    "describe": [
        "brown", "real", "yellow", "circle", "dark", "free", "popular", "wise",
        "stupid", "useful", "important", "bright", "clear",
        "convenient", "dot", "low", "medium", "successful", "shine",
        "careful",
    ],
    "body": ["die", "smell", "smoke", "thirsty", "sight"],
    "action": [
        "touch", "action", "break", "hunt", "become", "check", "collect",
        "cover", "guess", "appear", "enter", "attack", "fight", "fill", "hide",
        "notice", "shake", "blow", "clap", "kill", "send", "belong", "happen",
    ],
    "feeling": [
        "life", "dream", "cheer", "enjoy", "trouble", "favorite", "habit",
        "hobby", "interesting", "interested", "interest", "chance",
    ],
    "family": ["born", "age", "visit", "teenager"],
    "travel": ["gas", "truck", "stay", "camp", "railway", "abroad"],
    "money": [
        "mile", "inch", "gram", "pound", "kilogram (kg)", "centimeter (cm)",
        "piece", "wallet",
    ],
    "talk": ["lie", "sound", "voice"],
    "animal": ["cage", "bite", "feed"],
    "weather": ["snowman"],
    "clothes": ["T-shirt"],
    "work": ["lead"],
}


def norm(w):
    """把單字寫法正規化成比對用的小寫 key。

    PDF 裡同一個字可能有多種寫法：a (an)、father (dad,daddy)、PE(physical
    education)、yeah(=yes)。括號裡的替代說法比對時一律丟掉，只留主詞。
    """
    import re
    w = w.lower()
    # PDF 少數條目的單字欄位吃進了中文，例如 "T-shirt T恤"
    w = re.sub(r"[㐀-䶿一-鿿]+", " ", w)
    w = re.sub(r"\(.*?\)", " ", w)
    w = re.sub(r"[^a-z0-9' ]", " ", w)
    return re.sub(r"\s+", " ", w).strip()


def lookup():
    """回傳 {正規化單字: 場景 id}；同一個字只放一個場景，先到先得。"""
    table = {}
    valid = {sid for sid, _, _, _ in SCENARIOS}
    groups = [(sid, WORDS.get(sid, [])) for sid, _, _, _ in SCENARIOS]
    groups += [(k, v) for k, v in EXTRA.items() if k in valid]
    for sid, words in groups:
        for w in words:
            key = norm(w)
            if key and key not in table:
                table[key] = sid
    return table


if __name__ == "__main__":
    t = lookup()
    print(f"scenarios={len(SCENARIOS)} mapped-keys={len(t)}")
    for sid, name, icon, desc in SCENARIOS:
        print(f"  {sid:9s} {icon} {name:6s} {len(WORDS.get(sid, []))}")