import type { CEFRLevel, Story, VocabWord, WordCategory } from '../types.ts';
import { VOCAB_A1, VOCAB_A2 } from './vocabA1A2.ts';
import { VOCAB_B1, VOCAB_B2 } from './vocabB1B2.ts';

export const BUILTIN_WORDS: VocabWord[] = [
  ...VOCAB_A1,
  ...VOCAB_A2,
  ...VOCAB_B1,
  ...VOCAB_B2,
];

export const WORDS_BY_ID: Record<string, VocabWord> = Object.fromEntries(
  BUILTIN_WORDS.map((w) => [w.id, w])
);

// Deterministic PRNG so the 50 stories per level have randomized (non-ordered) 15-word selections
// that stay consistent across sessions for progress tracking.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic(pool: VocabWord[], seed: number): VocabWord[] {
  const rand = mulberry32(seed);
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const STORY_TITLES: Record<CEFRLevel, Array<[string, string, WordCategory]>> = {
  A1: [
    ['The Golden Bakery Note', 'رسالة المخبز الذهبي', 'daily'],
    ['Platform Four at Dawn', 'الرصيف الرابع عند الفجر', 'travel'],
    ['The Lost Brass Key', 'المفتاح النحاسي الضائع', 'daily'],
    ['Tea Under the Oak Tree', 'شاي تحت شجرة البلوط', 'daily'],
    ['Rain on Maple Street', 'مطر في شارع القيقب', 'daily'],
    ['A Bicycle with Two Baskets', 'دراجة بسلتين', 'travel'],
    ['The Red Notebook Mystery', 'لغز الدفتر الأحمر', 'career'],
    ['Morning Voices at the Market', 'أصوات الصباح في السوق', 'daily'],
    ['The Clockmaker’s Smile', 'ابتسامة صانع الساعات', 'daily'],
    ['Postcards from the River', 'بطاقات من النهر', 'travel'],
    ['A Quiet Table for Two', 'طاولة هادئة لشخصين', 'daily'],
    ['Green Leaves After Rain', 'أوراق خضراء بعد المطر', 'daily'],
    ['The Fast Express Ticket', 'تذكرة القطار السريع', 'travel'],
    ['Apples in the Garden', 'تفاح في الحديقة', 'daily'],
    ['Notes Inside a Pocket', 'ملاحظات داخل الجيب', 'daily'],
    ['Music from Window Three', 'موسيقى من النافذة الثالثة', 'daily'],
    ['Crossing the Stone Bridge', 'عبور الجسر الحجري', 'travel'],
    ['The Kind English Teacher', 'معلم الإنجليزية اللطيف', 'career'],
    ['Dinner with New Neighbors', 'عشاء مع الجيران الجدد', 'daily'],
    ['Camera Ready for Sunrise', 'كاميرا جاهزة للشروق', 'travel'],
    ['The Open Door at Nine', 'الباب المفتوح عند التاسعة', 'daily'],
    ['Sweet Bread in the Kitchen', 'خبز حلو في المطبخ', 'daily'],
    ['A Cloud Shaped Like a Boat', 'سحابة تشبه القارب', 'travel'],
    ['Waiting by the Station Clock', 'الانتظار قرب ساعة المحطة', 'travel'],
    ['Five Simple Questions', 'خمسة أسئلة بسيطة', 'career'],
    ['The Blue Chair by the Lamp', 'الكرسي الأزرق قرب المصباح', 'daily'],
    ['Fresh Mint and Warm Tea', 'نعناع طازج وشاي دافئ', 'daily'],
    ['The Student’s First Story', 'أول قصة للطالب', 'career'],
    ['A Walk Before Evening', 'نزهة قبل المساء', 'daily'],
    ['Sharing One Large Bag', 'مشاركة حقيبة كبيرة', 'travel'],
    ['The Yellow Flower Gift', 'هدية الزهرة الصفراء', 'daily'],
    ['Listen to the Rain Song', 'استمع لأغنية المطر', 'daily'],
    ['Early Bus to the Museum', 'الحافلة المبكرة إلى المتحف', 'travel'],
    ['A Clean Desk, A Clear Mind', 'مكتب نظيف وعقل صافٍ', 'career'],
    ['Finding the Hidden Cafe', 'العثور على المقهى المخفي', 'daily'],
    ['Letters Across the Sea', 'رسائل عبر البحر', 'travel'],
    ['The Friendly Street Corner', 'زاوية الشارع الودودة', 'daily'],
    ['Slow Mornings on Friday', 'صباحات هادئة يوم الجمعة', 'daily'],
    ['Choose Your Favorite Seat', 'اختر مقعدك المفضل', 'daily'],
    ['The Small Cat’s Secret', 'سر القطة الصغيرة', 'daily'],
    ['Bright Windows at Sunset', 'نوافذ مشرقة عند الغروب', 'daily'],
    ['Carry the Heavy Basket', 'حمل السلة الثقيلة', 'daily'],
    ['Learning Together Every Night', 'نتعلّم معًا كل مساء', 'career'],
    ['Photos of Our Old Street', 'صور شارعنا القديم', 'daily'],
    ['A Warm Welcome Home', 'ترحيب دافئ في المنزل', 'daily'],
    ['Speak with a Calm Voice', 'تحدث بصوت هادئ', 'career'],
    ['The Paper Envelope', 'المظروف الورقي', 'daily'],
    ['Two Tickets to Green Valley', 'تذكرتان إلى الوادي الأخضر', 'travel'],
    ['Evening Stories by the Table', 'قصص المساء حول الطاولة', 'daily'],
    ['The Final Answer Appears', 'ظهور الإجابة الأخيرة', 'career'],
  ],
  A2: [
    ['The Ferry to Cedar Island', 'العبّارة إلى جزيرة الأرز', 'travel'],
    ['Midnight Luggage Mix-Up', 'تبديل الأمتعة في منتصف الليل', 'travel'],
    ['Grandmother’s Secret Recipe', 'وصفة الجدة السرية', 'daily'],
    ['Lanterns Along the Harbor', 'فوانيس على طول الميناء', 'travel'],
    ['A Sudden Storm in the Valley', 'عاصفة مفاجئة في الوادي', 'travel'],
    ['The Polite Stranger’s Wallet', 'محفظة الغريب المهذب', 'travel'],
    ['Postcard Inside an Old Book', 'بطاقة بريدية داخل كتاب قديم', 'daily'],
    ['Climbing Pine Mountain', 'تسلق جبل الصنوبر', 'travel'],
    ['The Nervous First Speech', 'الخطاب الأول المتوتر', 'career'],
    ['Discount at the Corner Shop', 'خصم في متجر الزاوية', 'daily'],
    ['Repairing the Village Clock', 'إصلاح ساعة القرية', 'daily'],
    ['An Empty Seat on Platform Two', 'مقعد فارغ على الرصيف الثاني', 'travel'],
    ['Mirror Practice Every Morning', 'التمرين أمام المرآة كل صباح', 'career'],
    ['Fresh Figs from Next Door', 'تين طازج من الجيران', 'daily'],
    ['The Crowded Spice Market', 'سوق التوابل المزدحم', 'travel'],
    ['Following the Northern Compass', 'اتباع البوصلة الشمالية', 'travel'],
    ['Blue Curtains and Morning Light', 'ستائر زرقاء وضوء الصباح', 'daily'],
    ['The Helpful Librarian’s Advice', 'نصيحة أمينة المكتبة المفيدة', 'career'],
    ['A Concert Under the Stars', 'حفل موسيقي تحت النجوم', 'daily'],
    ['Keeping a Clear Study Schedule', 'الحفاظ على جدول دراسة واضح', 'career'],
    ['The Missing Train Receipt', 'إيصال القطار المفقود', 'travel'],
    ['Tea on a Peaceful Balcony', 'شاي على شرفة هادئة', 'daily'],
    ['Discovering the Ancient Arch', 'اكتشاف القوس الأثري', 'travel'],
    ['Borrowing a Red Umbrella', 'استعارة مظلة حمراء', 'daily'],
    ['A Delicious Mistake in the Kitchen', 'خطأ لذيذ في المطبخ', 'daily'],
    ['Early Ferry, Calm Harbor', 'عبّارة مبكرة وميناء هادئ', 'travel'],
    ['The Curious Student’s Notebook', 'دفتر الطالب الفضولي', 'career'],
    ['Warm Blankets on the Hill', 'بطانيات دافئة على التلة', 'daily'],
    ['Returning the Silver Key', 'إعادة المفتاح الفضي', 'daily'],
    ['Sunset Over the Forest Trail', 'غروب الشمس فوق ممر الغابة', 'travel'],
    ['Two Voices in the Museum', 'صوتان في المتحف', 'travel'],
    ['Preparing for the Autumn Trip', 'الاستعداد لرحلة الخريف', 'travel'],
    ['The Modern Station Cafe', 'مقهى المحطة الحديث', 'travel'],
    ['Inviting the Whole Street', 'دعوة الشارع بأكمله', 'daily'],
    ['A Careful Step on Wet Stone', 'خطوة حذرة على الحجر المبلل', 'travel'],
    ['Collecting Vintage Stamps', 'جمع الطوابع القديمة', 'daily'],
    ['Brightly Lit Harbor Boats', 'قوارب الميناء المضاءة بإشراق', 'travel'],
    ['Healthy Habits Before Dawn', 'عادات صحية قبل الفجر', 'daily'],
    ['The Famous Pottery Shop', 'متجر الفخار الشهير', 'travel'],
    ['Explaining the Map Calmly', 'شرح الخريطة بهدوء', 'travel'],
    ['Heavy Clouds, Light Hearts', 'سحب ثقيلة وقلوب خفيفة', 'travel'],
    ['Memory of a Summer Island', 'ذكرى جزيرة صيفية', 'travel'],
    ['Choosing the Patient Route', 'اختيار الطريق الصبور', 'career'],
    ['An Active Day in the Village', 'يوم نشيط في القرية', 'daily'],
    ['The Special Friday Dinner', 'عشاء الجمعة المميز', 'daily'],
    ['Cheap Tickets, Priceless Views', 'تذاكر رخيصة ومناظر لا تُقدر بثمن', 'travel'],
    ['Protecting the Garden Plants', 'حماية نباتات الحديقة', 'daily'],
    ['A Surprise Message at Noon', 'رسالة مفاجئة عند الظهيرة', 'daily'],
    ['Improving One Page Daily', 'تحسين صفحة واحدة يوميًا', 'career'],
    ['The Final Train Home', 'القطار الأخير إلى المنزل', 'travel'],
  ],
  B1: [
    ['The Unexpected Train Detour', 'التحويلة غير المتوقعة للقطار', 'travel'],
    ['Building a Habit at Dawn', 'بناء عادة عند الفجر', 'daily'],
    ['The Community Library Revival', 'إحياء مكتبة المجتمع', 'daily'],
    ['A Colleague’s Honest Feedback', 'ملاحظات زميل صادقة', 'career'],
    ['Navigating Fog with a Compass', 'الإبحار في الضباب بالبوصلة', 'travel'],
    ['Balancing Work and Rest', 'موازنة العمل والراحة', 'daily'],
    ['The Last-Minute Reservation', 'حجز اللحظة الأخيرة', 'travel'],
    ['Finding Evidence in Old Journals', 'العثور على دليل في يوميات قديمة', 'career'],
    ['A Creative Pitch Before Noon', 'عرض إبداعي قبل الظهر', 'career'],
    ['Lanterns Across the Horizon', 'فوانيس عبر الأفق', 'travel'],
    ['Overcoming the First Hesitation', 'تجاوز التردد الأول', 'career'],
    ['Volunteering at the Harbor Fair', 'التطوع في معرض الميناء', 'daily'],
    ['The Reliable Coastal Express', 'القطار الساحلي الموثوق', 'travel'],
    ['Persuading the skeptical Editor', 'إقناع المحرر المتشكك', 'career'],
    ['A Memorable Mountain Shelter', 'مأوى جبلي لا يُنسى', 'travel'],
    ['Meeting Friday’s Tight Deadline', 'اللحاق بالموعد النهائي يوم الجمعة', 'career'],
    ['Appreciating Small Daily Victories', 'تقدير الانتصارات اليومية الصغيرة', 'career'],
    ['Designing an Efficient Study Plan', 'تصميم خطة دراسة فعّالة', 'career'],
    ['The Architecture of Old Bridges', 'هندسة الجسور القديمة', 'travel'],
    ['Expressing Ideas Without Fear', 'التعبير عن الأفكار بلا خوف', 'career'],
    ['A Fresh Perspective from Abroad', 'منظور جديد من السفر', 'travel'],
    ['Staying Flexible Under Pressure', 'البقاء مرنًا تحت الضغط', 'career'],
    ['Stories That Spark Curiosity', 'قصص تشعل الفضول', 'career'],
    ['Confirming the Island Itinerary', 'تأكيد خط سير رحلة الجزيرة', 'travel'],
    ['The Quiet Power of Patience', 'القوة الهادئة للصبر', 'career'],
    ['Discoveries Along Side Streets', 'اكتشافات في الشوارع الجانبية', 'travel'],
    ['Comparing Two Paths Forward', 'مقارنة مسارين للمستقبل', 'career'],
    ['Shelter from the Autumn Downpour', 'مأوى من أمطار الخريف', 'travel'],
    ['A Determined Baker’s Tradition', 'تقليد خباز مصمّم', 'daily'],
    ['Concentrating Amid City Noise', 'التركيز وسط ضجيج المدينة', 'career'],
    ['Motivating the Evening Club', 'تحفيز النادي المسائي', 'career'],
    ['Gradually Mastering the Rhythm', 'إتقان الإيقاع تدريجيًا', 'career'],
    ['The Independent Bookshop Plan', 'خطة المكتبة المستقلة', 'career'],
    ['Responding with Calm Confidence', 'الرد بثقة هادئة', 'career'],
    ['Capturing the Misty Landscape', 'توثيق المنظر الضبابي', 'travel'],
    ['Practical Solutions at Sea', 'حلول عملية في البحر', 'travel'],
    ['The Grateful Traveler’s Note', 'رسالة المسافر الممتن', 'travel'],
    ['Managing Time Across Projects', 'إدارة الوقت عبر المشاريع', 'career'],
    ['When Signals Fade in the Valley', 'عندما تضعف الإشارة في الوادي', 'travel'],
    ['Supporting Newcomers in Town', 'دعم القادمين الجدد إلى البلدة', 'daily'],
    ['An Atmosphere of Shared Effort', 'أجواء من الجهد المشترك', 'daily'],
    ['Avoiding the Same Old Mistake', 'تجنب الخطأ القديم نفسه', 'career'],
    ['Accommodation Above the Bakery', 'سكن فوق المخبز', 'travel'],
    ['Suggesting a Better Route', 'اقتراح مسار أفضل', 'travel'],
    ['Meanwhile, Back at the Studio', 'في هذه الأثناء، في الاستوديو', 'career'],
    ['Priority Number One at Sunrise', 'الأولوية الأولى عند الشروق', 'career'],
    ['Natural Fluency Through Stories', 'طلاقة طبيعية عبر القصص', 'career'],
    ['Distance Between Two Harbors', 'المسافة بين ميناءين', 'travel'],
    ['A Resource Worth Sharing', 'مصدر يستحق المشاركة', 'career'],
    ['The Quiet Victory of Day Fifty', 'الانتصار الهادئ في اليوم الخمسين', 'career'],
  ],
  B2: [
    ['The Architecture of Resilience', 'هندسة الصمود والمرونة', 'career'],
    ['Reading Between Subtle Nuances', 'القراءة بين الفوارق الدقيقة', 'career'],
    ['Beyond the Memorization Paradigm', 'ما بعد نموذج الحفظ التقليدي', 'career'],
    ['A Pragmatic Dawn in Zurich', 'فجر عملي في زيورخ', 'travel'],
    ['Resolving Ambiguity at the Pier', 'حسم الغموض عند الرصيف', 'travel'],
    ['Momentum Through Deliberate Steps', 'الزخم عبر خطوات مدروسة', 'career'],
    ['The Authentic Neighborhood Voice', 'الصوت الأصيل للحي', 'daily'],
    ['Collaborating Across Time Zones', 'التعاون عبر المناطق الزمنية', 'career'],
    ['Preserving Memory in Timber and Ink', 'حفظ الذاكرة بالخشب والحبر', 'travel'],
    ['When Assumptions Meet Evidence', 'عندما تصطدم الافتراضات بالدليل', 'career'],
    ['Clarity Amid Rapid Change', 'الوضوح وسط التغيير السريع', 'career'],
    ['Sustainable Pace Over Burnout', 'وتيرة مستدامة بدل الإرهاق', 'career'],
    ['Synthesizing Ideas at Sunset', 'تركيب الأفكار عند الغروب', 'career'],
    ['The Art of Quiet Negotiation', 'فن التفاوض الهادئ', 'career'],
    ['Evaluating Progress Without Hype', 'تقييم التقدم بموضوعية', 'career'],
    ['Anticipating the Shift in Tide', 'استباق تغيّر المد البحري', 'travel'],
    ['A Compelling Case for Slow Rail', 'حجة مقنعة للقطار البطيء', 'travel'],
    ['Integrity in Every Draft', 'النزاهة في كل مسودة', 'career'],
    ['How Insight Emerges from Error', 'كيف تبرز البصيرة من الخطأ', 'career'],
    ['Distinguishing Signal from Noise', 'تمييز الإشارة عن الضجيج', 'career'],
    ['Adapting to Uncharted Cities', 'التكيّف مع مدن غير مألوفة', 'travel'],
    ['The Consensus Around Context', 'الإجماع حول قوة السياق', 'career'],
    ['Simultaneous Stories on the Ferry', 'قصص متزامنة على العبّارة', 'travel'],
    ['Contemplating the Harbor Lights', 'تأمل أضواء الميناء', 'daily'],
    ['Accelerating Growth with Feedback', 'تسريع النمو بالتغذية الراجعة', 'career'],
    ['Transparency in Community Design', 'الشفافية في تصميم المجتمع', 'career'],
    ['A Remarkable Turn in the Valley', 'منعطف لافت في الوادي', 'travel'],
    ['Spontaneous Wisdom at Breakfast', 'حكمة عفوية على الإفطار', 'daily'],
    ['Building Durable Study Autonomy', 'بناء استقلالية دراسة متينة', 'career'],
    ['The Consequence of Small Habits', 'عاقبة العادات الصغيرة', 'career'],
    ['Interpreting Silence in Dialogue', 'تفسير الصمت في الحوار', 'career'],
    ['Infrastructure of a Living Language', 'بنية اللغة الحية', 'career'],
    ['Reinforcing Vocabulary Naturally', 'ترسيخ المفردات بشكل طبيعي', 'career'],
    ['A Versatile Mindset in Travel', 'عقلية متعددة المهارات في السفر', 'travel'],
    ['Testing the Morning Hypothesis', 'اختبار فرضية الصباح', 'career'],
    ['Why Diversity Enriches Narratives', 'لماذا يثري التنوع القصص', 'daily'],
    ['Precision Under Tight Timelines', 'الدقة تحت المواعيد الضيقة', 'career'],
    ['Nonetheless, the Lantern Glowed', 'مع ذلك، ظل الفانوس مضيئًا', 'travel'],
    ['Articulating Vision with Grace', 'التعبير عن الرؤية بلباقة', 'career'],
    ['Profound Lessons from Short Walks', 'دروس عميقة من نزهات قصيرة', 'daily'],
    ['Allocating Attention Wisely', 'تخصيص الانتباه بحكمة', 'career'],
    ['When Complexity Turns Simple', 'عندما يصبح التعقيد بسيطًا', 'career'],
    ['The Phenomenon of Shared Reading', 'ظاهرة القراءة المشتركة', 'daily'],
    ['Diminishing Fear of Blank Pages', 'تلاشي الخوف من الصفحات البيضاء', 'career'],
    ['Elaborating Details That Matter', 'تفصيل الجوانب التي تصنع الفارق', 'career'],
    ['Consistent Discipline Over Months', 'انضباط ثابت عبر الأشهر', 'career'],
    ['A Fundamental Shift in Confidence', 'تحول جوهري في الثقة', 'career'],
    ['Crucial Decisions Before Departure', 'قرارات حاسمة قبل المغادرة', 'travel'],
    ['The Noble Endeavor of Fluency', 'المسعى النبيل لإتقان اللغة', 'career'],
    ['Reaching the Two-Hundredth Milestone', 'بلوغ المحطة المئتين', 'career'],
  ],
};

const CHARACTERS = ['Lina', 'Omar', 'Nadia', 'Tariq', 'Sara', 'Karim', 'Maya', 'Zayd', 'Hana', 'Rami'];
const SETTINGS_A1 = ['sunlit bakery', 'quiet park', 'corner bookshop', 'train station', 'stone courtyard', 'small harbor'];
const SETTINGS_A2 = ['coastal harbor', 'mountain village', 'evening ferry', 'historic square', 'city museum', 'forest cabin'];
const SETTINGS_B1 = ['design studio', 'community library', 'coastal railway', 'hilltop cafe', 'neighborhood market', 'creative workshop'];
const SETTINGS_B2 = ['architectural pavilion', 'maritime observatory', 'editorial newsroom', 'university archive', 'alpine rail terminal', 'cultural forum'];

/**
 * Generates an engaging, coherent ~100-word story tailored to the CEFR level
 * that explicitly weaves ALL 15 randomly selected target words into natural sentences.
 */
function buildCohesiveStoryText(
  level: CEFRLevel,
  storyIndex: number,
  title: string,
  words15: VocabWord[]
): string {
  const hero = CHARACTERS[storyIndex % CHARACTERS.length];
  const partner = CHARACTERS[(storyIndex + 3) % CHARACTERS.length];
  const rand = mulberry32(level.charCodeAt(1) * 1000 + storyIndex * 37);

  // Helper to weave a word naturally according to its part of speech inside a short, crisp sentence
  const w = words15;

  // Group words gently or integrate sequentially across 5 vivid narrative beats (~100 words total)
  const formatWordInBeat = (item: VocabWord, beatIdx: number): string => {
    const word = item.word;
    if (item.partOfSpeech === 'verb') {
      const verbOpeners = [
        `${hero} decided to ${word} before noon`,
        `friends often ${word} together here`,
        `they pause to ${word} calmly`,
        `${partner} reminded everyone to ${word} carefully`,
        `it felt rewarding to ${word} right away`,
      ];
      return verbOpeners[beatIdx % verbOpeners.length];
    }
    if (item.partOfSpeech === 'adjective') {
      const adjOpeners = [
        `the view seemed remarkably ${word}`,
        `a ${word} detail caught ${hero}’s eye`,
        `their mood stayed ${word} throughout the hour`,
        `everyone noticed how ${word} the scene looked`,
        `even a ${word} moment changed the plan`,
      ];
      return adjOpeners[beatIdx % adjOpeners.length];
    }
    if (item.partOfSpeech === 'adverb') {
      const advOpeners = [
        `${word}, the situation shifted for the better`,
        `${hero} moved ${word} toward the goal`,
        `things unfolded ${word} along the way`,
        `${partner} spoke ${word} and smiled`,
        `${word}, they solved the puzzle together`,
      ];
      return advOpeners[beatIdx % advOpeners.length];
    }
    const nounOpeners = [
      `a local ${word} anchored the scene`,
      `the ${word} became part of their plan`,
      `${hero} pointed toward the ${word}`,
      `an unexpected ${word} sparked a new idea`,
      `that simple ${word} tied everything together`,
    ];
    return nounOpeners[beatIdx % nounOpeners.length];
  };

  if (level === 'A1') {
    const place = SETTINGS_A1[storyIndex % SETTINGS_A1.length];
    const lines = [
      `In "${title}," ${hero} arrived at the ${place} with ${partner}.`,
      `${capitalize(formatWordInBeat(w[0], 0))}, and ${formatWordInBeat(w[1], 1)}.`,
      `Soon, ${formatWordInBeat(w[2], 2)} while ${formatWordInBeat(w[3], 3)}.`,
      `${capitalize(formatWordInBeat(w[4], 4))}.`,
      `${partner} laughed because ${formatWordInBeat(w[5], 0)} and ${formatWordInBeat(w[6], 1)}.`,
      `Nearby, ${formatWordInBeat(w[7], 2)}.`,
      `Next, ${formatWordInBeat(w[8], 3)}, so ${formatWordInBeat(w[9], 4)}.`,
      `${capitalize(formatWordInBeat(w[10], 0))}, and ${formatWordInBeat(w[11], 1)}.`,
      `Before going home, ${formatWordInBeat(w[12], 2)} while ${formatWordInBeat(w[13], 3)}.`,
      `Finally, ${formatWordInBeat(w[14], 4)}, leaving both friends proud and ready for tomorrow.`,
    ];
    return trimToTargetWords(lines.join(' '), w, 98);
  }

  if (level === 'A2') {
    const place = SETTINGS_A2[storyIndex % SETTINGS_A2.length];
    const lines = [
      `During "${title}," ${hero} and ${partner} explored a lively ${place}.`,
      `At first, ${formatWordInBeat(w[0], 0)}, yet ${formatWordInBeat(w[1], 1)}.`,
      `As travelers gathered, ${formatWordInBeat(w[2], 2)} and ${formatWordInBeat(w[3], 3)}.`,
      `${capitalize(formatWordInBeat(w[4], 4))}, which surprised the entire group.`,
      `Then ${hero} noticed that ${formatWordInBeat(w[5], 0)} while ${formatWordInBeat(w[6], 1)}.`,
      `Instead of worrying, ${formatWordInBeat(w[7], 2)} and ${formatWordInBeat(w[8], 3)}.`,
      `${capitalize(formatWordInBeat(w[9], 4))}, proving how helpful patience can be.`,
      `Later, ${formatWordInBeat(w[10], 0)} beside ${formatWordInBeat(w[11], 1)}.`,
      `Before sunset, ${formatWordInBeat(w[12], 2)}, ${formatWordInBeat(w[13], 3)}, and ${formatWordInBeat(w[14], 4)}.`,
      `They walked back smiling with a story worth telling.`,
    ];
    return trimToTargetWords(lines.join(' '), w, 100);
  }

  if (level === 'B1') {
    const place = SETTINGS_B1[storyIndex % SETTINGS_B1.length];
    const lines = [
      `When "${title}" began inside the ${place}, ${hero} faced an intriguing challenge with ${partner}.`,
      `Earlier that morning, ${formatWordInBeat(w[0], 0)}, and ${formatWordInBeat(w[1], 1)}.`,
      `Although time felt tight, ${formatWordInBeat(w[2], 2)} while ${formatWordInBeat(w[3], 3)}.`,
      `Quickly, ${formatWordInBeat(w[4], 4)} because ${formatWordInBeat(w[5], 0)}.`,
      `Midway through the afternoon, ${formatWordInBeat(w[6], 1)}, yet ${formatWordInBeat(w[7], 2)}.`,
      `${partner} suggested a fresh angle: ${formatWordInBeat(w[8], 3)} and ${formatWordInBeat(w[9], 4)}.`,
      `Working steadily, ${formatWordInBeat(w[10], 0)} as ${formatWordInBeat(w[11], 1)}.`,
      `By twilight, ${formatWordInBeat(w[12], 2)}, ${formatWordInBeat(w[13], 3)}, and ${formatWordInBeat(w[14], 4)}.`,
      `Both realized small daily efforts build remarkable progress.`,
    ];
    return trimToTargetWords(lines.join(' '), w, 102);
  }

  // B2: Richer clause connections and reflective tone (~100 words)
  const place = SETTINGS_B2[storyIndex % SETTINGS_B2.length];
  const twist = rand() > 0.5 ? 'an unexpected insight' : 'a thoughtful debate';
  const lines = [
    `Inside the ${place}, "${title}" opened with ${twist} between ${hero} and ${partner}.`,
    `Initially, ${formatWordInBeat(w[0], 0)}, whereas ${formatWordInBeat(w[1], 1)}.`,
    `Rather than rushing conclusions, ${formatWordInBeat(w[2], 2)} so that ${formatWordInBeat(w[3], 3)}.`,
    `Soon, ${formatWordInBeat(w[4], 4)}, demonstrating why ${formatWordInBeat(w[5], 0)}.`,
    `As dialogue deepened, ${formatWordInBeat(w[6], 1)} while ${formatWordInBeat(w[7], 2)}.`,
    `${capitalize(formatWordInBeat(w[8], 3))}, prompting ${formatWordInBeat(w[9], 4)}.`,
    `Ultimately, ${formatWordInBeat(w[10], 0)} and ${formatWordInBeat(w[11], 1)} without losing clarity.`,
    `Before departing, ${formatWordInBeat(w[12], 2)}, ${formatWordInBeat(w[13], 3)}, and ${formatWordInBeat(w[14], 4)}, sealing an unforgettable chapter.`,
  ];
  return trimToTargetWords(lines.join(' '), w, 102);
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function trimToTargetWords(text: string, words15: VocabWord[], _target: number): string {
  // Ensure every single one of the 15 target words is present (case-insensitive word-boundary check)
  let output = text.replace(/\s+/g, ' ').trim();
  const missing = words15.filter((w) => {
    const regex = new RegExp(`\\b${escapeRegExp(w.word)}\\b`, 'i');
    return !regex.test(output);
  });
  if (missing.length > 0) {
    output += ` Key ideas included ${missing.map((m) => m.word).join(', ')}.`;
  }
  return output;
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLevelStories(level: CEFRLevel, pool: VocabWord[]): Story[] {
  const titles = STORY_TITLES[level];
  const levelSeed = level.charCodeAt(0) * 10000 + level.charCodeAt(1) * 500 + 750;
  const shuffledPool = shuffleDeterministic(pool, levelSeed);

  return titles.map(([title, titleAr, category], idx) => {
    const start = idx * 15;
    const selected15: VocabWord[] = [];
    for (let k = 0; k < 15; k++) {
      if (start + k < shuffledPool.length) {
        selected15.push(shuffledPool[start + k]);
      } else if (shuffledPool.length > 0) {
        selected15.push(shuffledPool[(start + k) % shuffledPool.length]);
      }
    }
    const text = buildCohesiveStoryText(level, idx, title, selected15);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return {
      id: `${level.toLowerCase()}-story-${String(idx + 1).padStart(2, '0')}`,
      index: idx + 1,
      title,
      titleAr,
      level,
      category,
      text,
      wordCount,
      estimatedMinutes: Math.max(1, Math.round(wordCount / 85)),
      targetWordIds: selected15.map((w) => w.id),
    };
  });
}

export const BUILTIN_STORIES: Story[] = [
  ...buildLevelStories('A1', VOCAB_A1),
  ...buildLevelStories('A2', VOCAB_A2),
  ...buildLevelStories('B1', VOCAB_B1),
  ...buildLevelStories('B2', VOCAB_B2),
];

export const WRITING_TOPICS: Record<CEFRLevel, Array<{ en: string; ar: string; minWords: number }>> = {
  A1: [
    { en: 'Describe your favorite morning routine in 4–6 simple sentences.', ar: 'صِف روتينك الصباحي المفضل في 4 إلى 6 جمل بسيطة.', minWords: 30 },
    { en: 'Write about a friend you enjoy visiting and what you do together.', ar: 'اكتب عن صديق تستمتع بزيارته وماذا تفعلان معًا.', minWords: 30 },
    { en: 'Describe a walk to the market or park near your house.', ar: 'صِف نزهة إلى السوق أو الحديقة القريبة من منزلك.', minWords: 30 },
    { en: 'What food do you like to cook or eat for dinner?', ar: 'ما الطعام الذي تحب طبخه أو تناوله في العشاء؟', minWords: 30 },
  ],
  A2: [
    { en: 'Tell the story of a memorable train, bus, or ferry journey.', ar: 'احكِ قصة رحلة لا تُنسى بالقطار أو الحافلة أو العبّارة.', minWords: 45 },
    { en: 'Describe a kind neighbor or stranger who surprised you.', ar: 'صِف جارًا لطيفًا أو غريبًا فاجأك بموقف جميل.', minWords: 45 },
    { en: 'Write about your favorite season and how the weather feels.', ar: 'اكتب عن فصلك المفضل وكيف يبدو الطقس فيه.', minWords: 45 },
    { en: 'Share practical advice for someone learning English for the first time.', ar: 'شارك نصيحة عملية لشخص يتعلم الإنجليزية لأول مرة.', minWords: 45 },
  ],
  B1: [
    { en: 'Explain how a daily habit changed your confidence or productivity.', ar: 'اشرح كيف غيّرت عادة يومية ثقتك بنفسك أو إنتاجيتك.', minWords: 65 },
    { en: 'Write about an unexpected detour during a trip that became a great memory.', ar: 'اكتب عن تحويلة غير متوقعة أثناء رحلة تحوّلت إلى ذكرى رائعة.', minWords: 65 },
    { en: 'Compare studying alone versus learning inside a supportive community.', ar: 'قارن بين الدراسة الفردية والتعلم ضمن مجتمع داعم.', minWords: 65 },
    { en: 'Describe a creative project where you had to meet a tight deadline.', ar: 'صِف مشروعًا إبداعيًا اضطررت فيه للالتزام بموعد نهائي ضيق.', minWords: 65 },
  ],
  B2: [
    { en: 'What is your perspective on remote work and maintaining sustainable balance?', ar: 'ما وجهة نظرك حول العمل عن بُعد والحفاظ على توازن مستدام؟', minWords: 85 },
    { en: 'Discuss why learning vocabulary in story context outperforms isolated word lists.', ar: 'ناقش لماذا يتفوق تعلم المفردات داخل سياق القصص على قوائم الكلمات المنفصلة.', minWords: 85 },
    { en: 'Reflect on a setback that taught you resilience and clarity.', ar: 'تأمل في عقبة علّمتك الصمود والوضوح.', minWords: 85 },
    { en: 'How can modern cities preserve historic heritage while investing in green infrastructure?', ar: 'كيف يمكن للمدن الحديثة الحفاظ على التراث التاريخي مع الاستثمار في البنية الخضراء؟', minWords: 85 },
  ],
};

export interface PlacementQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  weightLevel: CEFRLevel;
}

export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  {
    id: 'pq-1',
    prompt: 'Every ______, I drink warm tea and read one short story.',
    options: ['morning', 'ticket', 'bridge', 'pocket'],
    correctIndex: 0,
    weightLevel: 'A1',
  },
  {
    id: 'pq-2',
    prompt: 'Please ______ your notebook and write three simple sentences.',
    options: ['wait', 'open', 'walk', 'listen'],
    correctIndex: 1,
    weightLevel: 'A1',
  },
  {
    id: 'pq-3',
    prompt: 'The express train will ______ from platform four in ten minutes.',
    options: ['borrow', 'depart', 'repair', 'invite'],
    correctIndex: 1,
    weightLevel: 'A2',
  },
  {
    id: 'pq-4',
    prompt: 'Checking your ______ before booking flights prevents sudden delays.',
    options: ['pillow', 'curtain', 'passport', 'receipt'],
    correctIndex: 2,
    weightLevel: 'A2',
  },
  {
    id: 'pq-5',
    prompt: 'Consistent daily reading will ______ boost your confidence and fluency.',
    options: ['gradually', 'hesitate', 'itinerary', 'crowded'],
    correctIndex: 0,
    weightLevel: 'B1',
  },
  {
    id: 'pq-6',
    prompt: 'Reading stories helps learners ______ subtle cultural nuances naturally.',
    options: ['fluctuate', 'diminish', 'comprehend', 'allocate'],
    correctIndex: 2,
    weightLevel: 'B2',
  },
];
