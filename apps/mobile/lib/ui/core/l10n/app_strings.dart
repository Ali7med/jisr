/// كل نصوص الواجهة في مكان واحد.
///
/// التطبيق عربي بالكامل حالياً؛ لو احتجنا لغة ثانية نستبدل هذا الملف بـ ARB
/// دون لمس الشاشات.
abstract final class S {
  static const appName = 'جسر';
  static const appTagline = 'كل أجهزتك على جسر واحد';

  // ── التكاملات والحسابات ────────────────────────────────────────────────────
  static const integrations = 'الشركات المدعومة';
  static const addAccount = 'ربط حساب';
  static const accounts = 'الحسابات المرتبطة';
  static const noAccounts = 'لم تربط أي حساب بعد';
  static const noAccountsHint =
      'اختر الشركة التي تعمل بها أجهزتك، وأدخل بيانات الوصول مرة واحدة.';
  static const chooseIntegration = 'اختر الشركة';
  static const accountLabel = 'اسم الحساب';
  static const accountLabelHint = 'اسم تميّزه به، مثل «البيت» أو «المكتب»';
  static const testAndSave = 'اختبار الاتصال والحفظ';
  static const testing = 'جارٍ الاختبار…';
  static const connectionOk = 'تم الاتصال بنجاح';
  static const required = 'هذا الحقل مطلوب';
  static const setupGuide = 'دليل الحصول على البيانات';
  static const removeAccount = 'إزالة الحساب';
  static const removeAccountConfirm =
      'ستُمسح بيانات هذا الحساب من الجهاز وتختفي أجهزته. متابعة؟';
  static const editAccount = 'تعديل الحساب';
  static const supportsHistory = 'يدعم السجلّ التاريخي';
  static const noPairing = 'الإقران يتم من تطبيق الشركة';

  // ── الأجهزة ────────────────────────────────────────────────────────────────
  static const devices = 'الأجهزة';
  static const searchDevices = 'ابحث عن جهاز…';
  static const noDevices = 'لا توجد أجهزة';
  static const noDevicesHint =
      'تأكّد أن أجهزتك مضافة في تطبيق الشركة وأن الحساب مربوط بشكل صحيح.';
  static const noSearchResults = 'لا نتائج مطابقة';
  static const online = 'متصل';
  static const offline = 'غير متصل';
  static const someIntegrationsFailed = 'تعذّر الوصول لبعض الحسابات';

  // ── التفاصيل ───────────────────────────────────────────────────────────────
  static const controls = 'التحكم';
  static const readings = 'القراءات';
  static const noControls = 'لا توجد وظائف تحكم لهذا الجهاز';
  static const noReadings = 'لا توجد قراءات';
  static const deviceOfflineNotice =
      'الجهاز غير متصل — الأوامر لن تصل إليه الآن.';
  static const unsupportedCapability = 'نوع غير مدعوم — القيمة الخام:';
  static const commandFailed = 'فشل تنفيذ الأمر';

  // ── السجلّ ─────────────────────────────────────────────────────────────────
  static const noHistory = 'لا توجد بيانات تاريخية لهذه القراءة';
  static const lastDay = 'آخر ٢٤ ساعة';
  static const lastWeek = 'آخر ٧ أيام';

  // ── عام ────────────────────────────────────────────────────────────────────
  static const retry = 'إعادة المحاولة';
  static const refresh = 'تحديث';
  static const settings = 'الإعدادات';
  static const cancel = 'إلغاء';
  static const confirm = 'تأكيد';
  static const loading = 'جارٍ التحميل…';
}
