    /* Storage-key migration + pre-paint theme now live in /js/halastudy-core.js
     * (loaded in <head> before this script runs). */

    function toggleDark() {
        // Delegates to core so the choice persists across pages/visits.
        window.HalaCore.toggleTheme();
    }

    const LANG_STORAGE_KEY = 'halastudyLang';
    const translations = {
        en: {
            pageTitle: 'Halastudy | Focus Room',
            themeToggleTitle: 'Toggle theme',
            shareRoomTitle: 'Share room link',
            todoTitle: 'Shared board',
            chatTitle: 'Chat Room',
            noiseTitle: 'Ambience',
            camMe: 'My camera',
            camPeer: 'Peer camera',
            aiMonitor: 'AI Focus Monitor',
            focusMode: 'Focus mode',
            breakMode: 'Break mode',
            todoPlaceholder: 'Add shared task...',
            roomGoalLabel: 'Room goal',
            roomGoalPlaceholder: 'What is everyone focusing on?',
            scheduleCardTitle: 'Scheduled room',
            scheduleOnTimeStat: 'On time',
            scheduleMissedStat: 'Missed',
            scheduleStreakStat: 'Streak',
            scheduleAddCalendar: 'Add to calendar',
            scheduleWhatsappInvite: 'WhatsApp invite',
            scheduleTimezoneLabel: 'Riyadh time',
            scheduleNextLabel: 'Next session',
            scheduleLiveLabel: 'Live now',
            scheduleTimerPresetLabel: 'Timer',
            scheduleCadenceOnce: 'One time',
            scheduleCadenceWeekdays: 'Sun-Thu',
            scheduleCadenceDaily: 'Daily',
            scheduleCadenceWeekly: 'Weekly',
            inviteShareTitle: 'Join my scheduled Halastudy room',
            inviteRoomCodeLabel: 'Room code',
            inviteNextLabel: 'Next session',
            inviteCadenceLabel: 'Cadence',
            sharedTaskEmpty: 'Shared tasks will appear here.',
            todoDeleteTitle: 'Delete task',
            priorityHigh: 'High priority',
            priorityMedium: 'Medium priority',
            priorityLow: 'Low priority',
            chatPlaceholder: 'Type a message...',
            timerSet: 'Focus',
            timerBreak: 'Break',
            minutesShort: 'm',
            joinTitle: 'Join the focus room',
            joinSubtitle: 'Enter your nickname and room code to start focusing together.',
            joinName: 'Your nickname',
            joinNamePlaceholder: 'Name shown to others',
            joinRoom: 'Room code',
            joinRoomPlaceholder: 'e.g. ABC123',
            joinPassword: 'Room password (if required)',
            joinPasswordPlaceholder: 'Leave empty if no password',
            joinButton: 'Enter room',
            roomLabel: 'Room',
            mediaModeLabel: 'Media',
            mediaModeMeshBadge: 'Mesh room',
            mediaModeSfuBadge: 'Large room',
            mediaModeRealtimeKitBadge: 'Study camera room',
            onlineLabel: 'Online',
            presenceEmpty: 'Waiting for friends to join...',
            chatEmpty: 'Messages will appear here',
            shareSuccess: 'Room link copied.',
            shareFallback: 'Copy this link and share it',
            codeCopied: 'Room code copied.',
            roomPillCopyTitle: 'Copy room code',
            disconnectMsg: 'Connection lost. Trying to reconnect...',
            joinNameError: 'Please enter a nickname.',
            roomCodeError: 'Please enter a room code.',
            serviceError: 'Realtime service is unavailable.',
            connectError: 'Connection failed. Please try again shortly.',
            joinFailed: 'Unable to join the room.',
            roomNotFound: 'That room code does not exist.',
            remoteWaiting: 'Waiting for your buddy to enable camera',
            remoteOffline: 'Peer camera is offline',
            cameraToggleOn: 'Enable camera',
            cameraToggleOff: 'Disable camera',
            cameraToggleStarting: 'Starting...',
            cameraError: 'Unable to access the camera.',
            aiReady: 'AI ready',
            aiFocused: 'Status: focused',
            aiAway: 'Status: possibly away',
            aiNeedCamera: 'Turn on the camera to enable AI monitoring.',
            aiUnsupported: 'AI monitoring needs a newer browser.',
            userListTitle: 'Room members',
            myStatus: 'My status',
            statusFocus: 'Focusing',
            statusBreak: 'On break',
            statusStudying: 'Studying',
            statusWorking: 'Working',
            statusMeal: 'Meal break',
            statusAway: 'Away',
            statusAutoSync: '🔄 Sync with timer',
            statusShare: '🔒 Share with room',
            statusCustomPlaceholder: 'Custom status...',
            goalLabel: 'Session goal',
            goalPlaceholder: 'What are you working on?',
            goalRecapToast: 'Focus session done — did you reach your goal?',
            preset25: '25 min focus / 5 min break',
            preset50: '50 min focus / 10 min break',
            preset90: '90 min focus / 15 min break',
            reportUser: 'Report',
            reportReasonSpam: 'Spam',
            reportReasonHarassment: 'Harassment',
            reportReasonInappropriate: 'Inappropriate content',
            reportCancel: 'Cancel',
            reportConfirmToast: 'Report sent — this user is now hidden for you',
            reportRateLimited: 'Too many reports — try again later',
            reportErrorGeneric: 'Could not send the report',
            userHiddenTag: 'Hidden',
            blurOn: 'Blur: on',
            blurOff: 'Blur: off',
            ambientSound: 'Ambient sound',
            ambientTitle: 'Choose ambient sound',
            ambientShowStatus: 'Show in status',
            ambientVolume: 'Volume',
            soundRain: 'Rain',
            soundForest: 'Forest',
            soundFire: 'Fireplace',
            soundCafe: 'Cafe',
            soundOcean: 'Ocean',
            soundNone: 'Off',
            soundListening: 'Listening to',
            videoCollapsedBanner: 'No video stream',
            statusHidden: 'Hidden',
            userJoined: 'joined the room',
            userLeft: 'left the room',
            focusTodayLabel: 'Today\'s focus',
            focusReset: 'Reset',
            meLabel: 'Me',
            focusMinutesSuffix: 'min',
            guestLabel: 'Guest',
            navSignIn: 'Sign in',
            kickedMsg: 'A moderator removed you from this room.',
            roomClosedMsg: 'This room was closed by a moderator.',
            nicknameReservedNote: 'Reserved for you',
            streakBadgeLabel: 'Streak',
            focusSyncHint: 'Your focus minutes only live on this device.',
            focusSyncHintCta: 'Sign up to keep your streak',
            roomNameRequired: 'Please enter a room name.',
            roomCodeGenerationFailed: 'Could not generate a room code. Please try again.',
            passwordHashFailed: 'Could not secure the room password right now.',
            roomPasswordRequired: 'This room requires a password.',
            roomPasswordMisconfigured: 'This room password is misconfigured.',
            roomPasswordInvalid: 'The room password is incorrect.',
            roomPasswordVerificationFailed: 'The room password could not be verified.',
            usernameTaken: 'That nickname is already in use.',
            roomNotJoined: 'Join a room first before sending messages.',
            roomFull: 'This mesh room is full. Ask the host to create a large room.',
            roomMediaUnavailable: 'Large-room media is unavailable on this deployment right now.',
            roomMediaModeInvalid: 'That room media mode is not supported.',
            videoJoinDisabled: 'Video joining is paused right now.',
            globalVideoLimitReached: 'The app is at the video capacity limit right now.',
            videoProviderUnavailable: 'Video connection is unavailable. Refresh and try again.',
            videoSessionNotFound: 'Video session expired. Try joining video again.',
            videoRequestInvalid: 'Video join request was invalid. Refresh and try again.',
            messageRequired: 'Please enter a message.',
            boardTaskRequired: 'Please enter a task.',
            boardTaskNotFound: 'That task no longer exists.',
            boardReorderInvalid: 'Could not reorder tasks. Refresh the board and try again.',
            boardErrorGeneric: 'Board update failed.',
            rateLimited: 'Too many attempts. Slow down and try again in a moment.',
            mediaMeshConnecting: 'Connecting video...',
            mediaMeshReconnecting: 'Reconnecting video...',
            mediaMeshWeak: 'Weak connection detected',
            mediaSfuLoading: 'Loading room media...',
            mediaSfuManaged: 'Room media is handled in the embedded session.',
            mediaSfuUnavailable: 'Room media unavailable.',
            mediaRealtimeKitLoading: 'Connecting camera room...',
            mediaRealtimeKitManaged: 'Camera room is live. Mic is off by default.',
            mediaRealtimeKitUnavailable: 'Camera room unavailable.',
            mediaRealtimeKitDetail: 'Camera is required for the room. Mic stays off automatically.',
            mediaRetry: 'Retry',
            aiSfuUnavailable: 'AI focus monitoring is available in mesh rooms only.'
        },
        ar: {
            pageTitle: 'هلاستدي | غرفة تركيز',
            themeToggleTitle: 'تبديل المظهر',
            shareRoomTitle: 'مشاركة رابط الغرفة',
            todoTitle: 'اللوحة المشتركة',
            chatTitle: 'غرفة الدردشة',
            noiseTitle: 'الأصوات المحيطة',
            camMe: 'كاميرتي',
            camPeer: 'كاميرا الشريك',
            aiMonitor: 'مراقبة التركيز بالذكاء الاصطناعي',
            focusMode: 'وضع التركيز',
            breakMode: 'وضع الاستراحة',
            todoPlaceholder: 'أضف مهمة مشتركة...',
            roomGoalLabel: 'هدف الغرفة',
            roomGoalPlaceholder: 'على ماذا سيركز الجميع؟',
            scheduleCardTitle: 'غرفة مجدولة',
            scheduleOnTimeStat: 'في الوقت',
            scheduleMissedStat: 'مفوّت',
            scheduleStreakStat: 'السلسلة',
            scheduleAddCalendar: 'أضف إلى التقويم',
            scheduleWhatsappInvite: 'دعوة واتساب',
            scheduleTimezoneLabel: 'توقيت الرياض',
            scheduleNextLabel: 'الجلسة القادمة',
            scheduleLiveLabel: 'الجلسة جارية الآن',
            scheduleTimerPresetLabel: 'المؤقت',
            scheduleCadenceOnce: 'مرة واحدة',
            scheduleCadenceWeekdays: 'الأحد - الخميس',
            scheduleCadenceDaily: 'يوميًا',
            scheduleCadenceWeekly: 'أسبوعيًا',
            inviteShareTitle: 'انضم إلى غرفة هلاستدي المجدولة',
            inviteRoomCodeLabel: 'رمز الغرفة',
            inviteNextLabel: 'الجلسة القادمة',
            inviteCadenceLabel: 'التكرار',
            sharedTaskEmpty: 'ستظهر المهام المشتركة هنا.',
            todoDeleteTitle: 'حذف المهمة',
            priorityHigh: 'أولوية عالية',
            priorityMedium: 'أولوية متوسطة',
            priorityLow: 'أولوية منخفضة',
            chatPlaceholder: 'اكتب رسالة...',
            timerSet: 'تركيز',
            timerBreak: 'استراحة',
            minutesShort: 'د',
            joinTitle: 'الدخول إلى غرفة التركيز',
            joinSubtitle: 'أدخل اسمك ورمز الغرفة لتبدأوا التركيز معاً.',
            joinName: 'اسمك داخل الغرفة',
            joinNamePlaceholder: 'الاسم الذي سيظهر للآخرين',
            joinRoom: 'رمز الغرفة',
            joinRoomPlaceholder: 'مثال: ABC123',
            joinPassword: 'كلمة مرور الغرفة (عند الحاجة)',
            joinPasswordPlaceholder: 'اتركها فارغة إذا لم تكن هناك كلمة مرور',
            joinButton: 'الدخول إلى الغرفة',
            roomLabel: 'الغرفة',
            mediaModeLabel: 'الوسائط',
            mediaModeMeshBadge: 'غرفة Mesh',
            mediaModeSfuBadge: 'غرفة كبيرة',
            mediaModeRealtimeKitBadge: 'غرفة كاميرا للمذاكرة',
            onlineLabel: 'المتصلون',
            presenceEmpty: 'في انتظار دخول بقية المجموعة...',
            chatEmpty: 'ستظهر الرسائل هنا',
            shareSuccess: 'تم نسخ رابط الغرفة.',
            shareFallback: 'انسخ هذا الرابط وشاركه',
            codeCopied: 'تم نسخ رمز الغرفة.',
            roomPillCopyTitle: 'انسخ رمز الغرفة',
            disconnectMsg: 'انقطع الاتصال. تتم محاولة إعادة الربط...',
            joinNameError: 'فضلاً أدخل الاسم.',
            roomCodeError: 'فضلاً أدخل رمز الغرفة.',
            serviceError: 'خدمة الاتصال الفوري غير متاحة.',
            connectError: 'فشل الاتصال. حاول مرة أخرى بعد قليل.',
            joinFailed: 'تعذر دخول الغرفة.',
            roomNotFound: 'رمز الغرفة هذا غير موجود.',
            remoteWaiting: 'في انتظار أن يفعّل شريكك الكاميرا',
            remoteOffline: 'كاميرا الشريك متوقفة',
            cameraToggleOn: 'تشغيل الكاميرا',
            cameraToggleOff: 'إيقاف الكاميرا',
            cameraToggleStarting: 'جارٍ التشغيل...',
            cameraError: 'تعذر الوصول إلى الكاميرا.',
            aiReady: 'الذكاء الاصطناعي جاهز',
            aiFocused: 'الحالة: مركز',
            aiAway: 'الحالة: قد يكون مبتعداً',
            aiNeedCamera: 'فعّل الكاميرا لتشغيل مراقبة التركيز.',
            aiUnsupported: 'هذه الميزة تحتاج متصفحاً أحدث.',
            userListTitle: 'أعضاء الغرفة',
            myStatus: 'حالتي',
            statusFocus: 'في تركيز',
            statusBreak: 'في استراحة',
            statusStudying: 'أذاكر',
            statusWorking: 'أعمل',
            statusMeal: 'استراحة طعام',
            statusAway: 'مبتعد',
            statusAutoSync: '🔄 مزامنة مع المؤقت',
            statusShare: '🔒 مشاركة مع الغرفة',
            statusCustomPlaceholder: 'حالة مخصصة...',
            goalLabel: 'هدف الجلسة',
            goalPlaceholder: 'على ماذا تعمل؟',
            goalRecapToast: 'انتهت جلسة التركيز — هل حققت هدفك؟',
            preset25: '25 دقيقة تركيز / 5 دقائق استراحة',
            preset50: '50 دقيقة تركيز / 10 دقائق استراحة',
            preset90: '90 دقيقة تركيز / 15 دقيقة استراحة',
            reportUser: 'تبليغ',
            reportReasonSpam: 'إزعاج متكرر',
            reportReasonHarassment: 'إساءة',
            reportReasonInappropriate: 'محتوى غير لائق',
            reportCancel: 'إلغاء',
            reportConfirmToast: 'تم إرسال البلاغ — تم إخفاء هذا المستخدم عنك',
            reportRateLimited: 'بلاغات كثيرة — حاول لاحقًا',
            reportErrorGeneric: 'تعذر إرسال البلاغ',
            userHiddenTag: 'مخفي',
            blurOn: 'التمويه: مفعّل',
            blurOff: 'التمويه: معطّل',
            ambientSound: 'الصوت المحيط',
            ambientTitle: 'اختر الصوت المحيط',
            ambientShowStatus: 'إظهاره في الحالة',
            ambientVolume: 'مستوى الصوت',
            soundRain: 'مطر',
            soundForest: 'غابة',
            soundFire: 'مدفأة',
            soundCafe: 'مقهى',
            soundOcean: 'بحر',
            soundNone: 'إيقاف',
            soundListening: 'يستمع إلى',
            videoCollapsedBanner: 'لا يوجد بث فيديو',
            statusHidden: 'مخفي',
            userJoined: 'دخل الغرفة',
            userLeft: 'غادر الغرفة',
            focusTodayLabel: 'تركيز اليوم',
            focusReset: 'إعادة ضبط',
            meLabel: 'أنا',
            focusMinutesSuffix: 'دقيقة',
            guestLabel: 'زائر',
            navSignIn: 'تسجيل الدخول',
            kickedMsg: 'أخرجك مشرف من هذه الغرفة.',
            roomClosedMsg: 'أغلق مشرف هذه الغرفة.',
            nicknameReservedNote: 'محجوز لك',
            streakBadgeLabel: 'سلسلة',
            focusSyncHint: 'دقائق تركيزك محفوظة على هذا الجهاز فقط.',
            focusSyncHintCta: 'سجّل لحفظ سلسلتك',
            roomNameRequired: 'فضلاً أدخل اسم الغرفة.',
            roomCodeGenerationFailed: 'تعذر إنشاء رمز للغرفة. حاول مرة أخرى.',
            passwordHashFailed: 'تعذر تأمين كلمة مرور الغرفة حالياً.',
            roomPasswordRequired: 'هذه الغرفة تحتاج كلمة مرور.',
            roomPasswordMisconfigured: 'إعداد كلمة المرور في هذه الغرفة غير صحيح.',
            roomPasswordInvalid: 'كلمة مرور الغرفة غير صحيحة.',
            roomPasswordVerificationFailed: 'تعذر التحقق من كلمة مرور الغرفة.',
            usernameTaken: 'هذا الاسم مستخدم بالفعل.',
            roomNotJoined: 'ادخل إلى غرفة أولاً قبل إرسال الرسائل.',
            roomFull: 'غرفة الـ Mesh هذه ممتلئة. اطلب من المضيف إنشاء غرفة كبيرة.',
            roomMediaUnavailable: 'وسائط الغرف الكبيرة غير متاحة في هذا النشر حالياً.',
            roomMediaModeInvalid: 'وضع وسائط الغرفة هذا غير مدعوم.',
            videoJoinDisabled: 'الدخول بالفيديو متوقف مؤقتاً الآن.',
            globalVideoLimitReached: 'وصل التطبيق إلى الحد الأقصى للفيديو حالياً.',
            videoProviderUnavailable: 'تعذر اتصال الفيديو. حدّث الصفحة وحاول مرة أخرى.',
            videoSessionNotFound: 'انتهت جلسة الفيديو. حاول الانضمام للفيديو مرة أخرى.',
            videoRequestInvalid: 'طلب دخول الفيديو غير صحيح. حدّث الصفحة وحاول مرة أخرى.',
            messageRequired: 'فضلاً اكتب رسالة.',
            boardTaskRequired: 'فضلاً اكتب مهمة.',
            boardTaskNotFound: 'هذه المهمة لم تعد موجودة.',
            boardReorderInvalid: 'تعذر إعادة ترتيب المهام. حدّث اللوحة وحاول مرة أخرى.',
            boardErrorGeneric: 'تعذر تحديث اللوحة.',
            rateLimited: 'تم تنفيذ محاولات كثيرة. تمهّل وحاول مرة أخرى بعد قليل.',
            mediaMeshConnecting: 'جارٍ توصيل الفيديو...',
            mediaMeshReconnecting: 'جارٍ إعادة توصيل الفيديو...',
            mediaMeshWeak: 'تم اكتشاف اتصال ضعيف',
            mediaSfuLoading: 'جارٍ تحميل وسائط الغرفة...',
            mediaSfuManaged: 'تتم إدارة وسائط الغرفة داخل الجلسة المضمنة.',
            mediaSfuUnavailable: 'وسائط الغرفة غير متاحة.',
            mediaRealtimeKitLoading: 'جارٍ توصيل غرفة الكاميرا...',
            mediaRealtimeKitManaged: 'غرفة الكاميرا تعمل. المايك مقفل تلقائياً.',
            mediaRealtimeKitUnavailable: 'غرفة الكاميرا غير متاحة.',
            mediaRealtimeKitDetail: 'الكاميرا مطلوبة للدخول للغرفة. المايك مقفل تلقائياً.',
            mediaRetry: 'إعادة المحاولة',
            aiSfuUnavailable: 'مراقبة التركيز بالذكاء الاصطناعي متاحة في غرف الـ Mesh فقط.'
        }
    };
    const langDict = translations;
    const SERVER_ERROR_KEYS = {
        ROOM_NAME_REQUIRED: 'roomNameRequired',
        ROOM_CODE_GENERATION_FAILED: 'roomCodeGenerationFailed',
        PASSWORD_HASH_FAILED: 'passwordHashFailed',
        NICKNAME_REQUIRED: 'joinNameError',
        ROOM_CODE_REQUIRED: 'roomCodeError',
        ROOM_NOT_FOUND: 'roomNotFound',
        ROOM_PASSWORD_REQUIRED: 'roomPasswordRequired',
        ROOM_PASSWORD_MISCONFIGURED: 'roomPasswordMisconfigured',
        ROOM_PASSWORD_INVALID: 'roomPasswordInvalid',
        ROOM_PASSWORD_VERIFICATION_FAILED: 'roomPasswordVerificationFailed',
        USERNAME_TAKEN: 'usernameTaken',
        ROOM_NOT_JOINED: 'roomNotJoined',
        ROOM_FULL: 'roomFull',
        ROOM_MEDIA_UNAVAILABLE: 'roomMediaUnavailable',
        ROOM_MEDIA_MODE_INVALID: 'roomMediaModeInvalid',
        VIDEO_JOIN_DISABLED: 'videoJoinDisabled',
        GLOBAL_VIDEO_LIMIT_REACHED: 'globalVideoLimitReached',
        VIDEO_PROVIDER_UNAVAILABLE: 'videoProviderUnavailable',
        VIDEO_SESSION_NOT_FOUND: 'videoSessionNotFound',
        VIDEO_REQUEST_INVALID: 'videoRequestInvalid',
        MESSAGE_REQUIRED: 'messageRequired',
        RATE_LIMITED: 'rateLimited',
        BOARD_TASK_REQUIRED: 'boardTaskRequired',
        BOARD_TASK_NOT_FOUND: 'boardTaskNotFound',
        BOARD_REORDER_INVALID: 'boardReorderInvalid'
    };
    const MEDIA_MODE_MESH = 'mesh';
    const MEDIA_MODE_SFU = 'sfu';
    const VIDEO_PROVIDER_MESH = 'mesh';
    const VIDEO_PROVIDER_REALTIMEKIT = 'realtimekit';
    const DEFAULT_MESH_PARTICIPANT_LIMIT = 4;
    const SFU_LOAD_TIMEOUT_MS = 6000;
    let curLang = getStoredLanguage();

    const sharedBoardCard = document.getElementById('shared-board-card');
    const roomGoalInput = document.getElementById('room-goal');
    const todoList = document.getElementById('todo-list');
    const newTaskInput = document.getElementById('new-task');
    const addTaskBtn = document.getElementById('add-task-btn');
    const priorityButtons = document.querySelectorAll('.todo-priority-btn');
    const boardFeedbackEl = document.getElementById('board-feedback');
    const doneCountEl = document.getElementById('done-cnt');
    const totalCountEl = document.getElementById('total-cnt');
    const progressBarEl = document.getElementById('prog-bar');
    const chatMsgs = document.getElementById('chat-msgs');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send');
    const chatForm = document.getElementById('chat-form');
    const roomCodeVal = document.getElementById('room-code-val');
    const mediaModeValueEl = document.getElementById('media-mode-value');
    const presenceCountEl = document.getElementById('presence-count');
    const presenceNamesEl = document.getElementById('presence-names');
    const joinOverlay = document.getElementById('join-overlay');
    const joinForm = document.getElementById('join-form');
    const joinNameInput = document.getElementById('join-name');
    const joinRoomInput = document.getElementById('join-room');
    const joinPasswordInput = document.getElementById('join-password');
    const joinError = document.getElementById('join-error');
    const localVideo = document.getElementById('local-video');
    const remoteGrid = document.getElementById('remote-grid');
    const cameraToggleBtn = document.getElementById('camera-toggle');
    const remotePlaceholder = document.getElementById('remote-placeholder');
    const remoteStatusEl = document.getElementById('remote-status');
    const remoteNameLabel = document.getElementById('remote-name');
    const aiStatusEl = document.getElementById('ai-status-text');
    const aiDot = document.getElementById('ai-dot');
    const userListEl = document.getElementById('user-list');
    const userListCountEl = document.getElementById('user-list-count');
    const statusCustomInput = document.getElementById('status-custom');
    const statusGoalInput = document.getElementById('status-goal');
    const statusAutoSyncToggle = document.getElementById('status-auto-sync');
    const statusShareToggle = document.getElementById('status-share');
    const statusPresetButtons = document.querySelectorAll('.status-btn');
    const statusPreviewEl = document.getElementById('status-preview');
    const scheduleCardEl = document.getElementById('schedule-card');
    const scheduleSubtitleEl = document.getElementById('schedule-subtitle');
    const scheduleCountdownEl = document.getElementById('schedule-countdown');
    const scheduleMetaEl = document.getElementById('schedule-meta');
    const scheduleOnTimeEl = document.getElementById('schedule-on-time');
    const scheduleMissedEl = document.getElementById('schedule-missed');
    const scheduleStreakEl = document.getElementById('schedule-streak');
    const scheduleCalendarBtn = document.getElementById('schedule-calendar-btn');
    const scheduleWhatsappLink = document.getElementById('schedule-whatsapp-link');
    const ambientToggleBtn = document.getElementById('ambient-toggle');
    const ambientPopover = document.getElementById('ambient-popover');
    const ambientListEl = document.getElementById('ambient-list');
    const ambientVolumeInput = document.getElementById('ambient-volume');
    const ambientStatusShareToggle = document.getElementById('ambient-status-share');
    const videoBoxEl = document.querySelector('.video-box');
    const videoCollapseBanner = document.getElementById('video-collapse-banner');
    const mediaStatePanel = document.getElementById('media-state-panel');
    const mediaStateTextEl = document.getElementById('media-state-text');
    const mediaStateDetailEl = document.getElementById('media-state-detail');
    const mediaRetryBtn = document.getElementById('media-retry-btn');
    const languageButtons = document.querySelectorAll('[data-lang-value]');

    let socket = null;
    let username = '';
    let roomId = '';
    let roomMembershipToken = '';
    let presenceCount = 0;
    let presenceCache = [];
    let participantsMap = new Map();
    const peerConnections = new Map();
    const remoteCameraStates = new Map();
    const remoteVideoSlots = new Map();
    // Peers hidden locally after a report — session-only, clears on reload.
    // Chat is name-keyed (server messages carry only the author name).
    const hiddenPeers = { ids: new Set(), names: new Set() };
    let pendingReportTargetId = null;
    const REPORT_REASON_KEYS = { spam: 'reportReasonSpam', harassment: 'reportReasonHarassment', inappropriate: 'reportReasonInappropriate' };
    const pendingIceCandidates = new Map();
    const DEFAULT_ICE_SERVERS = [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ];
    let rtcConfiguration = { iceServers: cloneIceServers(DEFAULT_ICE_SERVERS) };
    let rtcConfigurationPromise = Promise.resolve(rtcConfiguration);
    const DEFAULT_SCHEDULE_TIMEZONE = 'Asia/Riyadh';
    const DEFAULT_SCHEDULE_CADENCE = 'weekdays';
    const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
    const SCHEDULE_DAY_MS = 24 * 60 * 60 * 1000;
    const SCHEDULE_JOIN_EARLY_WINDOW_MS = 15 * 60 * 1000;
    const MAX_SCHEDULE_LOOKAHEAD_MS = 370 * SCHEDULE_DAY_MS;
    const MAX_SCHEDULE_ITERATIONS = 5000;
    let runtimeConfig = {
        sfuAvailable: false,
        supportedMediaModes: [MEDIA_MODE_MESH],
        meshParticipantLimit: DEFAULT_MESH_PARTICIPANT_LIMIT,
        videoProvider: VIDEO_PROVIDER_MESH,
        videoPolicy: null,
        publicApiBaseUrl: ''
    };
    let sfuBaseUrl = '';
    let roomMediaMode = MEDIA_MODE_MESH;
    let roomVideoProvider = VIDEO_PROVIDER_MESH;
    let roomParticipantLimit = DEFAULT_MESH_PARTICIPANT_LIMIT;
    let roomVideoPolicy = null;
    let roomSchedule = null;
    let scheduleCountdownTimer = null;
    const sfuFrame = document.getElementById('sfu-frame');
    const videoBox = document.querySelector('.video-box');
    const realtimeKitContainer = document.getElementById('realtimekit-container');
    const realtimeKitMeeting = document.getElementById('realtimekit-meeting');
    const videoClient = window.HalastudyVideoClient
        ? window.HalastudyVideoClient.createVideoClient({
            apiBaseUrl: window.HALASTUDY_CONFIG?.API_BASE_URL || ''
        })
        : null;
    let sfuFrameLoadTimer = null;
    let sfuFrameLoaded = false;
    let realtimeKitJoining = false;
    let localStream = null;
    let cameraEnabled = false;

    // --- Whole-frame privacy blur (mesh only) ---
    // Raw gUM stream -> hidden <video> -> canvas ctx.filter blur ->
    // canvas.captureStream() becomes localStream. Peers and the local
    // preview both get the blurred feed; the FaceDetector reads the
    // hidden raw video so focus detection is unaffected.
    const BLUR_PREF_KEY = 'halastudyBlurPref';
    let rawStream = null;
    let blurEnabled = (() => {
        try {
            const saved = localStorage.getItem(BLUR_PREF_KEY);
            return saved === null ? true : saved === 'on';
        } catch (_) { return true; }
    })();
    const blurPipeline = { canvas: null, ctx: null, rawVideo: null, rafId: null, intervalId: null, running: false, processedTrack: null };
    const supportsCanvasFilter = (() => {
        try {
            const probe = document.createElement('canvas');
            const probeCtx = probe.getContext('2d');
            if (!probeCtx || typeof probe.captureStream !== 'function') return false;
            probeCtx.filter = 'blur(1px)';
            return probeCtx.filter === 'blur(1px)';
        } catch (_) { return false; }
    })();
    let aiMonitorTimer = null;
    let aiDetector = null;
    const BOARD_GOAL_MAX_LENGTH = 80;
    const BOARD_TASK_MAX_LENGTH = 120;
    const STATUS_STORAGE_KEY = 'halastudyStatusState';
    const AMBIENT_STORAGE_KEY = 'halastudyAmbientState';
    let selectedBoardPriority = 3;
    let boardEnabled = false;
    let boardFeedbackKey = '';
    let boardState = { goal: '', tasks: [] };
    const STATUS_PRESET_MAP = { meal: 'statusMeal', away: 'statusAway', studying: 'statusStudying', working: 'statusWorking' };
    const statusState = { manualText: '', manualPreset: null, goal: '', autoSync: false, isShared: true, lastUpdated: null };
    const ambientSoundState = { type: null, enabled: false, volume: 0.5, showInStatus: true, audio: null, cache: {} };
    const AMBIENT_SOUNDS = {
        rain: { src: '/audio/rain.mp3', labelKey: 'soundRain', icon: '🌧️' },
        forest: { src: '/audio/forest.mp3', labelKey: 'soundForest', icon: '🌲' },
        fire: { src: '/audio/chimney-fire.mp3', labelKey: 'soundFire', icon: '🔥' },
        cafe: { src: '/audio/cafe.mp3', labelKey: 'soundCafe', icon: '☕' },
        ocean: { src: '/audio/waves.mp3', labelKey: 'soundOcean', icon: '🌊' }
    };
    const TIMER_NOTIFICATION_SOUNDS = {
        focusEnd: new Audio('/audio/work-end.mp3'),
        breakEnd: new Audio('/audio/break-end.mp3')
    };
    let collapseRemoteTimeout = null;
    let timerRunning = false;
    let statusBroadcastTimer = null;

    const FOCUS_STATS_KEY = 'halastudyFocusStats';
    const focusTotalEl = document.getElementById('focus-total');
    const focusResetBtn = document.getElementById('focus-reset-btn');
    let focusStats = { date: null, totalSeconds: 0 };
    let focusStatsResetTimer = null;

    const CLIENT_ID_STORAGE_KEY = 'halastudyClientId';
    let clientId = null;

    function ensureClientId() {
        if (clientId) return clientId;
        try {
            clientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
        } catch (_err) {
            clientId = null;
        }
        if (!clientId) {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                clientId = window.crypto.randomUUID();
            } else {
                clientId = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            }
            try {
                localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
            } catch (_err) {}
        }
        return clientId;
    }

    function getRoomPassword() {
        if (joinPasswordInput?.value.trim()) {
            return joinPasswordInput.value.trim();
        }
        try {
            return sessionStorage.getItem('halastudyRoomPassword') || '';
        } catch (_err) {
            return '';
        }
    }

    function storeRoomPassword(value) {
        try {
            if (value) {
                sessionStorage.setItem('halastudyRoomPassword', value);
            }
        } catch (_err) {}
    }

    function getStoredRoomCode() {
        try {
            return sessionStorage.getItem('halastudyRoomCode') || '';
        } catch (_err) {
            return '';
        }
    }

    function clearStoredRoomCode() {
        try {
            sessionStorage.removeItem('halastudyRoomCode');
        } catch (_err) {}
    }

    const DEBUG = true;
    function debugLog(category, message, data) {
        if (!DEBUG) return;
        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
        console.log(`[${timestamp}] [${category}]`, message, data || '');
    }

    function getStoredLanguage() {
        try {
            return localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'ar';
        } catch (_err) {
            return 'en';
        }
    }

    function setStoredLanguage(lang) {
        try {
            localStorage.setItem(LANG_STORAGE_KEY, lang);
        } catch (_err) {}
    }

    function cloneIceServers(iceServers = []) {
        return iceServers.map(serverEntry => ({
            ...serverEntry,
            urls: Array.isArray(serverEntry.urls) ? [...serverEntry.urls] : serverEntry.urls
        }));
    }

    function fallbackRtcConfiguration() {
        return { iceServers: cloneIceServers(DEFAULT_ICE_SERVERS) };
    }

    function sanitizeRuntimeIceServer(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

        let urls = [];
        if (typeof entry.urls === 'string') {
            const trimmedUrl = entry.urls.trim();
            if (trimmedUrl) urls = [trimmedUrl];
        } else if (Array.isArray(entry.urls)) {
            urls = entry.urls
                .filter(value => typeof value === 'string')
                .map(value => value.trim())
                .filter(Boolean);
        }

        if (!urls.length) return null;

        const sanitized = {
            urls: typeof entry.urls === 'string' && urls.length === 1 ? urls[0] : urls
        };
        if (typeof entry.username === 'string' && entry.username.trim()) {
            sanitized.username = entry.username.trim();
        }
        if (typeof entry.credential === 'string' && entry.credential.trim()) {
            sanitized.credential = entry.credential.trim();
        }
        if (typeof entry.credentialType === 'string' && entry.credentialType.trim()) {
            sanitized.credentialType = entry.credentialType.trim();
        }

        return sanitized;
    }

    function resolveRtcConfiguration(payload) {
        if (!payload || !Array.isArray(payload.iceServers)) {
            return fallbackRtcConfiguration();
        }

        const sanitizedIceServers = payload.iceServers
            .map(sanitizeRuntimeIceServer)
            .filter(Boolean);

        if (!sanitizedIceServers.length) {
            return fallbackRtcConfiguration();
        }

        return { iceServers: cloneIceServers(sanitizedIceServers) };
    }

    async function loadRtcConfiguration() {
        const fallback = fallbackRtcConfiguration();
        if (typeof fetch !== 'function') {
            rtcConfiguration = fallback;
            return rtcConfiguration;
        }

        try {
            const response = await fetch('/api/runtime-config', {
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) {
                throw new Error(`Runtime config request failed with ${response.status}`);
            }
            const payload = await response.json();
            rtcConfiguration = resolveRtcConfiguration(payload);
            applyRuntimeConfig(payload);
            if (sfuBaseUrl) {
                debugLog('SFU', 'SFU base URL configured', sfuBaseUrl);
            }
            debugLog('RTC-CONFIG', 'Loaded runtime ICE configuration', rtcConfiguration.iceServers);
            return rtcConfiguration;
        } catch (err) {
            console.warn('Falling back to default ICE servers.', err);
            debugLog('RTC-CONFIG', 'Using fallback ICE configuration', err.message);
            rtcConfiguration = fallback;
            applyRuntimeConfig();
            return rtcConfiguration;
        }
    }

    function ensureRtcConfigurationReady() {
        return rtcConfigurationPromise.catch(() => rtcConfiguration);
    }

    function currentCopy() {
        return translations[curLang] || translations.en;
    }

    function getErrorMessage(errorCode, fallbackKey) {
        const key = SERVER_ERROR_KEYS[errorCode] || fallbackKey;
        return currentCopy()[key] || currentCopy()[fallbackKey] || '';
    }

    function formatFocusMinutes(totalMinutes) {
        // Today's focus is an emotional number — Eastern numerals in AR (§5).
        return `${formatEmotionalNumber(totalMinutes)} ${currentCopy().focusMinutesSuffix}`;
    }

    function formatScheduleCadenceLabel(cadence) {
        if (cadence === 'once') return currentCopy().scheduleCadenceOnce;
        if (cadence === 'daily') return currentCopy().scheduleCadenceDaily;
        if (cadence === 'weekly') return currentCopy().scheduleCadenceWeekly;
        return currentCopy().scheduleCadenceWeekdays;
    }

    function formatRiyadhDateTime(timestamp) {
        if (!timestamp) return '';
        try {
            return new Intl.DateTimeFormat(curLang === 'ar' ? 'ar-SA' : 'en-SA', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: DEFAULT_SCHEDULE_TIMEZONE
            }).format(new Date(timestamp));
        } catch (_error) {
            return new Date(timestamp).toISOString();
        }
    }

    function formatCountdown(ms) {
        const safeMs = Math.max(0, ms);
        const totalSeconds = Math.floor(safeMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function clearScheduleCountdownTimer() {
        if (!scheduleCountdownTimer) return;
        clearInterval(scheduleCountdownTimer);
        scheduleCountdownTimer = null;
    }

    function buildRoomLink(targetRoomId = roomId) {
        return `${window.location.origin}/index.html?room=${encodeURIComponent(targetRoomId)}`;
    }

    function escapeIcsText(value) {
        return `${value || ''}`
            .replace(/\\/g, '\\\\')
            .replace(/\r?\n/g, '\\n')
            .replace(/,/g, '\\,')
            .replace(/;/g, '\\;');
    }

    function formatUtcForIcs(timestamp) {
        const date = new Date(timestamp);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(date.getUTCMinutes()).padStart(2, '0');
        const second = String(date.getUTCSeconds()).padStart(2, '0');
        return `${year}${month}${day}T${hour}${minute}${second}Z`;
    }

    function normalizeScheduleCadence(cadence) {
        const normalized = typeof cadence === 'string' ? cadence.trim().toLowerCase() : DEFAULT_SCHEDULE_CADENCE;
        return ['once', 'daily', 'weekly', 'weekdays'].includes(normalized) ? normalized : DEFAULT_SCHEDULE_CADENCE;
    }

    function parseScheduleDateString(value) {
        if (typeof value !== 'string') return null;
        const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;

        const year = Number.parseInt(match[1], 10);
        const month = Number.parseInt(match[2], 10);
        const day = Number.parseInt(match[3], 10);
        const probe = new Date(Date.UTC(year, month - 1, day));
        if (
            probe.getUTCFullYear() !== year
            || probe.getUTCMonth() !== month - 1
            || probe.getUTCDate() !== day
        ) {
            return null;
        }

        return { year, month, day };
    }

    function parseScheduleTimeString(value) {
        if (typeof value !== 'string') return null;
        const match = value.trim().match(/^(\d{2}):(\d{2})$/);
        if (!match) return null;

        const hour = Number.parseInt(match[1], 10);
        const minute = Number.parseInt(match[2], 10);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return null;
        }

        return { hour, minute };
    }

    function getRiyadhPartsFromTimestamp(timestamp) {
        const date = new Date(timestamp + RIYADH_OFFSET_MS);
        return {
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
            hour: date.getUTCHours(),
            minute: date.getUTCMinutes(),
            dayOfWeek: date.getUTCDay()
        };
    }

    function getRiyadhDatePartsFromTimestamp(timestamp) {
        const parts = getRiyadhPartsFromTimestamp(timestamp);
        return {
            year: parts.year,
            month: parts.month,
            day: parts.day,
            dayOfWeek: parts.dayOfWeek
        };
    }

    function timestampFromRiyadhParts(parts) {
        return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour - 3, parts.minute, 0, 0);
    }

    function shiftRiyadhDate(parts, days) {
        const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + (days * SCHEDULE_DAY_MS));
        return {
            year: probe.getUTCFullYear(),
            month: probe.getUTCMonth() + 1,
            day: probe.getUTCDate(),
            dayOfWeek: probe.getUTCDay()
        };
    }

    function isSaudiWeekday(dayOfWeek) {
        return dayOfWeek >= 0 && dayOfWeek <= 4;
    }

    function getScheduleStartTimestamp(schedule) {
        const dateParts = parseScheduleDateString(schedule?.startDate);
        const timeParts = parseScheduleTimeString(schedule?.startTime);
        if (!dateParts || !timeParts) return null;
        return timestampFromRiyadhParts({
            year: dateParts.year,
            month: dateParts.month,
            day: dateParts.day,
            hour: timeParts.hour,
            minute: timeParts.minute
        });
    }

    function getScheduleWindowMs(schedule) {
        const focusMinutes = Number.parseInt(schedule?.focusMinutes, 10) || 25;
        const breakMinutes = Number.parseInt(schedule?.breakMinutes, 10) || 5;
        const explicitWindowMinutes = Number.parseInt(schedule?.sessionWindowMinutes, 10) || 0;
        return Math.max(30, explicitWindowMinutes || (focusMinutes + breakMinutes)) * 60 * 1000;
    }

    function getNextScheduleOccurrence(schedule, currentTimestamp) {
        if (!schedule || currentTimestamp === null || currentTimestamp === undefined) {
            return null;
        }

        const cadence = normalizeScheduleCadence(schedule.cadence);
        if (cadence === 'once') {
            return null;
        }

        const currentDate = getRiyadhDatePartsFromTimestamp(currentTimestamp);
        const timeParts = parseScheduleTimeString(schedule.startTime);
        if (!timeParts) {
            return null;
        }

        if (cadence === 'daily') {
            const nextDate = shiftRiyadhDate(currentDate, 1);
            return timestampFromRiyadhParts({
                ...nextDate,
                hour: timeParts.hour,
                minute: timeParts.minute
            });
        }

        if (cadence === 'weekly') {
            const nextDate = shiftRiyadhDate(currentDate, 7);
            return timestampFromRiyadhParts({
                ...nextDate,
                hour: timeParts.hour,
                minute: timeParts.minute
            });
        }

        let nextDate = shiftRiyadhDate(currentDate, 1);
        while (!isSaudiWeekday(nextDate.dayOfWeek)) {
            nextDate = shiftRiyadhDate(nextDate, 1);
        }
        return timestampFromRiyadhParts({
            ...nextDate,
            hour: timeParts.hour,
            minute: timeParts.minute
        });
    }

    function fallbackScheduleRuntimeState(schedule = roomSchedule, now = Date.now()) {
        if (!schedule) {
            return {
                isLive: false,
                currentOccurrenceAt: null,
                nextOccurrenceAt: null,
                countdownTargetAt: null,
                nextTargetAt: null
            };
        }

        const durationMs = getScheduleWindowMs(schedule);
        const activeStart = typeof schedule.currentOccurrenceAt === 'number'
            ? schedule.currentOccurrenceAt
            : (typeof schedule.countdownTargetAt === 'number' ? schedule.countdownTargetAt : null);

        if (typeof activeStart === 'number' && now >= activeStart && now < activeStart + durationMs) {
            return {
                isLive: true,
                currentOccurrenceAt: schedule.currentOccurrenceAt || activeStart,
                nextOccurrenceAt: typeof schedule.nextOccurrenceAt === 'number' ? schedule.nextOccurrenceAt : null,
                countdownTargetAt: typeof schedule.nextOccurrenceAt === 'number' ? schedule.nextOccurrenceAt : null,
                nextTargetAt: typeof schedule.nextOccurrenceAt === 'number' ? schedule.nextOccurrenceAt : null
            };
        }

        if (typeof activeStart === 'number' && now < activeStart) {
            return {
                isLive: false,
                currentOccurrenceAt: typeof schedule.currentOccurrenceAt === 'number' ? schedule.currentOccurrenceAt : null,
                nextOccurrenceAt: typeof schedule.nextOccurrenceAt === 'number' ? schedule.nextOccurrenceAt : null,
                countdownTargetAt: activeStart,
                nextTargetAt: activeStart
            };
        }

        if (typeof schedule.nextOccurrenceAt === 'number' && schedule.nextOccurrenceAt > now) {
            return {
                isLive: false,
                currentOccurrenceAt: null,
                nextOccurrenceAt: schedule.nextOccurrenceAt,
                countdownTargetAt: schedule.nextOccurrenceAt,
                nextTargetAt: schedule.nextOccurrenceAt
            };
        }

        return {
            isLive: false,
            currentOccurrenceAt: null,
            nextOccurrenceAt: null,
            countdownTargetAt: null,
            nextTargetAt: null
        };
    }

    function resolveScheduleRuntimeState(schedule = roomSchedule, now = Date.now()) {
        if (!schedule) {
            return fallbackScheduleRuntimeState(schedule, now);
        }

        const startedAt = getScheduleStartTimestamp(schedule);
        if (startedAt === null) {
            return fallbackScheduleRuntimeState(schedule, now);
        }

        const sessionWindowMs = getScheduleWindowMs(schedule);
        let occurrenceAt = startedAt;
        let iterations = 0;

        while (
            occurrenceAt !== null
            && iterations < MAX_SCHEDULE_ITERATIONS
            && occurrenceAt <= now + MAX_SCHEDULE_LOOKAHEAD_MS
        ) {
            const nextOccurrenceAt = getNextScheduleOccurrence(schedule, occurrenceAt);
            const closeAt = nextOccurrenceAt || (occurrenceAt + sessionWindowMs);

            if (now >= occurrenceAt - SCHEDULE_JOIN_EARLY_WINDOW_MS && now < closeAt) {
                const isLive = now >= occurrenceAt && now < occurrenceAt + sessionWindowMs;
                const nextTargetAt = now < occurrenceAt ? occurrenceAt : (nextOccurrenceAt || null);
                return {
                    isLive,
                    currentOccurrenceAt: occurrenceAt,
                    nextOccurrenceAt: nextOccurrenceAt || null,
                    countdownTargetAt: nextTargetAt,
                    nextTargetAt
                };
            }

            if (occurrenceAt > now) {
                return {
                    isLive: false,
                    currentOccurrenceAt: null,
                    nextOccurrenceAt: occurrenceAt,
                    countdownTargetAt: occurrenceAt,
                    nextTargetAt: occurrenceAt
                };
            }

            occurrenceAt = nextOccurrenceAt;
            iterations += 1;
        }

        return fallbackScheduleRuntimeState(schedule, now);
    }

    function buildScheduleCalendarPayload() {
        if (!roomSchedule || !roomId) return null;
        const runtimeState = resolveScheduleRuntimeState(roomSchedule);
        const startAt = runtimeState.currentOccurrenceAt || runtimeState.nextOccurrenceAt;
        if (!startAt) return null;
        const durationMinutes = Math.max(30, Number(roomSchedule.focusMinutes || 25) + Number(roomSchedule.breakMinutes || 5));
        const endAt = startAt + (durationMinutes * 60 * 1000);
        const link = buildRoomLink(roomId);
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Halastudy//Scheduled Room//EN',
            'BEGIN:VEVENT',
            `UID:${escapeIcsText((roomId || 'room').toLowerCase())}@co-study`,
            `DTSTAMP:${formatUtcForIcs(Date.now())}`,
            `SUMMARY:${escapeIcsText(roomSchedule.title || roomId || 'Halastudy Session')}`,
            `DESCRIPTION:${escapeIcsText(`${currentCopy().inviteShareTitle}\n${currentCopy().inviteRoomCodeLabel}: ${roomId}\n${link}`)}`,
            `URL:${escapeIcsText(link)}`,
            `DTSTART:${formatUtcForIcs(startAt)}`,
            `DTEND:${formatUtcForIcs(endAt)}`
        ];
        if (roomSchedule.cadence === 'daily') {
            lines.push('RRULE:FREQ=DAILY');
        } else if (roomSchedule.cadence === 'weekly') {
            lines.push('RRULE:FREQ=WEEKLY');
        } else if (roomSchedule.cadence === 'weekdays') {
            lines.push('RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH');
        }
        lines.push('END:VEVENT', 'END:VCALENDAR');
        return `${lines.join('\r\n')}\r\n`;
    }

    function downloadScheduleCalendar() {
        const payload = buildScheduleCalendarPayload();
        if (!payload) return;
        const blob = new Blob([payload], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${(roomId || 'co-study-room').toLowerCase()}-schedule.ics`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function buildScheduleWhatsappLink() {
        if (!roomSchedule || !roomId) return '#';
        const runtimeState = resolveScheduleRuntimeState(roomSchedule);
        const nextTarget = runtimeState.countdownTargetAt || runtimeState.currentOccurrenceAt || runtimeState.nextOccurrenceAt;
        const lines = [
            currentCopy().inviteShareTitle,
            roomSchedule.title || roomId,
            `${currentCopy().inviteRoomCodeLabel}: ${roomId}`
        ];
        if (nextTarget) {
            lines.push(`${currentCopy().inviteNextLabel}: ${formatRiyadhDateTime(nextTarget)}`);
        }
        lines.push(`${currentCopy().inviteCadenceLabel}: ${formatScheduleCadenceLabel(roomSchedule.cadence)}`);
        lines.push(buildRoomLink(roomId));
        return `https://wa.me/?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`;
    }

    function getScheduleRuntimeState(schedule = roomSchedule, now = Date.now()) {
        return resolveScheduleRuntimeState(schedule, now);
    }

    function updateScheduleMeta(runtimeState = getScheduleRuntimeState(roomSchedule)) {
        if (!scheduleMetaEl || !roomSchedule) return;

        const metaBits = [
            `${formatScheduleCadenceLabel(roomSchedule.cadence)} · ${currentCopy().scheduleTimezoneLabel}`,
            `${currentCopy().scheduleTimerPresetLabel}: ${roomSchedule.focusMinutes || 25}/${roomSchedule.breakMinutes || 5}`
        ];

        if (runtimeState.isLive) {
            metaBits.push(currentCopy().scheduleLiveLabel);
        } else if (runtimeState.nextTargetAt) {
            metaBits.push(`${currentCopy().scheduleNextLabel}: ${formatRiyadhDateTime(runtimeState.nextTargetAt)}`);
        }

        scheduleMetaEl.textContent = metaBits.join(' · ');
        if (scheduleWhatsappLink) {
            scheduleWhatsappLink.href = buildScheduleWhatsappLink();
        }
    }

    function updateScheduleCountdown() {
        if (!roomSchedule || !scheduleCountdownEl) return;
        const runtimeState = getScheduleRuntimeState(roomSchedule);
        updateScheduleMeta(runtimeState);
        if (runtimeState.isLive) {
            scheduleCountdownEl.textContent = currentCopy().scheduleLiveLabel;
            return;
        }
        if (!runtimeState.nextTargetAt) {
            scheduleCountdownEl.textContent = '';
            return;
        }
        const diff = runtimeState.nextTargetAt - Date.now();
        if (diff <= 0) {
            scheduleCountdownEl.textContent = currentCopy().scheduleLiveLabel;
            return;
        }
        scheduleCountdownEl.textContent = `${currentCopy().scheduleNextLabel}: ${formatCountdown(diff)}`;
    }

    function renderScheduleCard() {
        if (!scheduleCardEl || !scheduleSubtitleEl || !scheduleMetaEl) return;
        if (!roomSchedule) {
            scheduleCardEl.hidden = true;
            clearScheduleCountdownTimer();
            if (scheduleWhatsappLink) scheduleWhatsappLink.href = '#';
            return;
        }

        scheduleCardEl.hidden = false;
        scheduleSubtitleEl.textContent = roomSchedule.title || `${formatScheduleCadenceLabel(roomSchedule.cadence)} · ${currentCopy().scheduleTimezoneLabel}`;
        const runtimeState = getScheduleRuntimeState(roomSchedule);
        updateScheduleMeta(runtimeState);
        if (scheduleOnTimeEl) scheduleOnTimeEl.textContent = String(roomSchedule.attendance?.joinedOnTimeCount || 0);
        if (scheduleMissedEl) scheduleMissedEl.textContent = String(roomSchedule.attendance?.missedCount || 0);
        if (scheduleStreakEl) scheduleStreakEl.textContent = String(roomSchedule.attendance?.currentStreak || 0);
        updateScheduleCountdown();
        clearScheduleCountdownTimer();
        scheduleCountdownTimer = setInterval(updateScheduleCountdown, 1000);
    }

    function applyScheduleDefaults(schedule) {
        if (!schedule) return;
        if (timerRunning) return;
        const focusInput = document.getElementById('cfg-f');
        const breakInput = document.getElementById('cfg-b');
        if (focusInput && schedule.focusMinutes) {
            focusInput.value = String(schedule.focusMinutes);
        }
        if (breakInput && schedule.breakMinutes) {
            breakInput.value = String(schedule.breakMinutes);
        }
        resetTimer();
    }

    function normalizeMediaMode(mode) {
        return mode === MEDIA_MODE_SFU ? MEDIA_MODE_SFU : MEDIA_MODE_MESH;
    }

    function normalizeVideoProvider(provider) {
        return provider === VIDEO_PROVIDER_REALTIMEKIT ? VIDEO_PROVIDER_REALTIMEKIT : VIDEO_PROVIDER_MESH;
    }

    function getMeshParticipantLimit(limit = runtimeConfig.meshParticipantLimit) {
        return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_MESH_PARTICIPANT_LIMIT;
    }

    function isMeshRoom() {
        return normalizeVideoProvider(roomVideoProvider) === VIDEO_PROVIDER_MESH
            && normalizeMediaMode(roomMediaMode) === MEDIA_MODE_MESH;
    }

    function isSfuRoom() {
        return normalizeVideoProvider(roomVideoProvider) === VIDEO_PROVIDER_MESH
            && normalizeMediaMode(roomMediaMode) === MEDIA_MODE_SFU;
    }

    function isRealtimeKitRoom() {
        return normalizeVideoProvider(roomVideoProvider) === VIDEO_PROVIDER_REALTIMEKIT;
    }

    function formatMediaModeLabel(mode = roomMediaMode) {
        if (isRealtimeKitRoom()) {
            return currentCopy().mediaModeRealtimeKitBadge;
        }
        return normalizeMediaMode(mode) === MEDIA_MODE_SFU
            ? currentCopy().mediaModeSfuBadge
            : currentCopy().mediaModeMeshBadge;
    }

    function setMediaState(messageKey = '', options = {}) {
        if (!mediaStatePanel || !mediaStateTextEl || !mediaStateDetailEl || !mediaRetryBtn) return;
        const detailKey = options.detailKey || '';
        const showRetry = !!options.showRetry;

        if (!messageKey && !detailKey) {
            mediaStatePanel.hidden = true;
            mediaStateTextEl.textContent = '';
            mediaStateDetailEl.textContent = '';
            mediaStateDetailEl.hidden = true;
            mediaRetryBtn.hidden = true;
            return;
        }

        mediaStatePanel.hidden = false;
        mediaStateTextEl.textContent = messageKey ? (currentCopy()[messageKey] || '') : '';
        mediaStateDetailEl.textContent = detailKey ? (currentCopy()[detailKey] || '') : '';
        mediaStateDetailEl.hidden = !detailKey;
        mediaRetryBtn.hidden = !showRetry;
    }

    function updateMediaModeBadge() {
        if (!mediaModeValueEl) return;
        mediaModeValueEl.textContent = formatMediaModeLabel();
    }

    function clearSfuFrameLoadTimer() {
        if (!sfuFrameLoadTimer) return;
        clearTimeout(sfuFrameLoadTimer);
        sfuFrameLoadTimer = null;
    }

    function closeAllPeerConnections() {
        peerConnections.forEach((pc) => {
            pc.close();
        });
        peerConnections.clear();
        pendingIceCandidates.clear();
    }

    function clearAllMeshMedia() {
        closeAllPeerConnections();
        remoteCameraStates.clear();
        clearRemoteStream();
    }

    function drawBlurFrame() {
        const { ctx, canvas, rawVideo } = blurPipeline;
        if (!ctx || !rawVideo?.videoWidth) return;
        ctx.filter = 'blur(14px)';
        ctx.drawImage(rawVideo, 0, 0, canvas.width, canvas.height);
    }

    function startBlurLoop() {
        // rAF while visible; interval fallback while hidden (rAF throttles in
        // background tabs, which would freeze the outgoing feed for peers).
        const stepRaf = () => {
            if (!blurPipeline.running) return;
            drawBlurFrame();
            blurPipeline.rafId = requestAnimationFrame(stepRaf);
        };
        if (blurPipeline.rafId) cancelAnimationFrame(blurPipeline.rafId);
        if (blurPipeline.intervalId) clearInterval(blurPipeline.intervalId);
        blurPipeline.rafId = null;
        blurPipeline.intervalId = null;
        if (document.hidden) {
            blurPipeline.intervalId = setInterval(drawBlurFrame, 1000 / 15);
        } else {
            blurPipeline.rafId = requestAnimationFrame(stepRaf);
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (blurPipeline.running) startBlurLoop();
        if (timerRunning) reconcileTimer();
    });

    async function startBlurPipeline(stream) {
        stopBlurPipeline({ keepRaw: true });
        const rawVideo = document.createElement('video');
        rawVideo.muted = true;
        rawVideo.playsInline = true;
        rawVideo.autoplay = true;
        // Off-screen but not display:none — hidden videos can stall decoding.
        rawVideo.style.cssText = 'position:fixed;inset-inline-start:-9999px;inline-size:2px;block-size:2px;opacity:0;pointer-events:none;';
        document.body.appendChild(rawVideo);
        rawVideo.srcObject = stream;
        await new Promise((resolve) => {
            if (rawVideo.readyState >= 1 && rawVideo.videoWidth) return resolve();
            rawVideo.onloadedmetadata = () => resolve();
            setTimeout(resolve, 3000);
        });
        try { await rawVideo.play(); } catch (_) {}
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings ? track.getSettings() : {};
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(settings.width || rawVideo.videoWidth || 640, 640);
        canvas.height = Math.min(settings.height || rawVideo.videoHeight || 480, 480);
        blurPipeline.canvas = canvas;
        blurPipeline.ctx = canvas.getContext('2d');
        blurPipeline.rawVideo = rawVideo;
        blurPipeline.running = true;
        // At least one frame must be drawn before captureStream, or peers
        // receive black video until the first draw lands.
        drawBlurFrame();
        const processed = canvas.captureStream(Math.min(settings.frameRate || 24, 30));
        blurPipeline.processedTrack = processed.getVideoTracks()[0];
        startBlurLoop();
        debugLog('BLUR', 'Pipeline started', { width: canvas.width, height: canvas.height });
        return processed;
    }

    // Single teardown owner for everything the pipeline created. Stops the
    // raw camera tracks too unless keepRaw is set (blur-off keeps the camera
    // running and hands the raw stream back to peers).
    function stopBlurPipeline(options = {}) {
        const { keepRaw = false } = options;
        blurPipeline.running = false;
        if (blurPipeline.rafId) { cancelAnimationFrame(blurPipeline.rafId); blurPipeline.rafId = null; }
        if (blurPipeline.intervalId) { clearInterval(blurPipeline.intervalId); blurPipeline.intervalId = null; }
        if (blurPipeline.processedTrack) {
            try { blurPipeline.processedTrack.stop(); } catch (_) {}
            blurPipeline.processedTrack = null;
        }
        if (blurPipeline.rawVideo) {
            blurPipeline.rawVideo.srcObject = null;
            blurPipeline.rawVideo.remove();
            blurPipeline.rawVideo = null;
        }
        blurPipeline.canvas = null;
        blurPipeline.ctx = null;
        if (!keepRaw && rawStream) {
            rawStream.getTracks().forEach(track => { try { track.stop(); } catch (_) {} });
            rawStream = null;
        }
    }

    async function toggleBlur() {
        blurEnabled = !blurEnabled;
        try { localStorage.setItem(BLUR_PREF_KEY, blurEnabled ? 'on' : 'off'); } catch (_) {}
        updateBlurToggleLabel();
        if (!cameraEnabled || !rawStream) return;
        try {
            if (blurEnabled && supportsCanvasFilter) {
                localStream = await startBlurPipeline(rawStream);
            } else {
                stopBlurPipeline({ keepRaw: true });
                localStream = rawStream;
            }
        } catch (err) {
            debugLog('ERROR', 'Blur toggle failed', err.message);
            stopBlurPipeline({ keepRaw: true });
            localStream = rawStream;
        }
        localVideo.srcObject = localStream;
        // existingSender.replaceTrack path — swaps without renegotiation.
        for (const pc of peerConnections.values()) {
            await attachLocalStream(pc);
        }
    }

    function updateBlurToggleLabel() {
        const blurBtn = document.getElementById('blur-toggle');
        if (!blurBtn) return;
        const showButton = supportsCanvasFilter && isMeshRoom();
        blurBtn.hidden = !showButton;
        if (!showButton) return;
        blurBtn.textContent = blurEnabled ? langDict[curLang].blurOn : langDict[curLang].blurOff;
        blurBtn.setAttribute('aria-pressed', blurEnabled ? 'true' : 'false');
    }

    function disableCamera(options = {}) {
        const { notify = true, preserveStatusText = false } = options;
        if (!cameraEnabled && !localStream) {
            if (!preserveStatusText && !isSfuRoom()) {
                aiStatusEl.textContent = langDict[curLang].aiNeedCamera;
            }
            return;
        }
        cameraEnabled = false;
        // Blur on: localVideo holds the processed canvas track, so stopping
        // only srcObject tracks would leave the raw camera (and its light)
        // running. stopBlurPipeline() stops the raw tracks too.
        stopBlurPipeline();
        if (localVideo.srcObject) {
            localVideo.srcObject.getTracks().forEach((track) => {
                track.stop();
            });
            localVideo.srcObject = null;
        }
        localVideo.style.display = 'none';
        localStream = null;
        if (notify && isMeshRoom()) {
            notifyCameraStatus(false);
        }
        updateCameraToggleLabel();
        updateRemotePlaceholder();
        peerConnections.forEach((pc, peerId) => {
            pc.getSenders().forEach(sender => {
                if (sender.track && sender.track.kind === 'video') {
                    try { sender.replaceTrack(null); } catch (_) {}
                    try { pc.removeTrack(sender); } catch (_) {}
                }
            });
            const meta = pc.__meta || {};
            meta.recvonlyVideoTransceiver = null;
            ensureRecvPlaceholder(pc, meta, peerId);
        });
        stopAiMonitor();
        if (!preserveStatusText) {
            aiStatusEl.textContent = isSfuRoom() ? langDict[curLang].aiSfuUnavailable : langDict[curLang].aiNeedCamera;
        }
    }

    function unmountSfuFrame() {
        clearSfuFrameLoadTimer();
        sfuFrameLoaded = false;
        if (sfuFrame) {
            sfuFrame.onload = null;
            sfuFrame.onerror = null;
            sfuFrame.src = 'about:blank';
        }
        if (videoBox) {
            videoBox.classList.remove('sfu-mode');
        }
        if (!isSfuRoom() && !isRealtimeKitRoom()) {
            setMediaState('');
        }
    }

    function unmountRealtimeKit(options = {}) {
        realtimeKitJoining = false;
        if (videoBox) {
            videoBox.classList.remove('realtimekit-mode');
        }
        if (realtimeKitContainer) {
            realtimeKitContainer.hidden = true;
        }
        if (realtimeKitMeeting) {
            realtimeKitMeeting.meeting = null;
        }
        if (videoClient && options.leave !== false) {
            void videoClient.leave({ keepalive: !!options.keepalive });
        }
    }

    async function mountRealtimeKitRoom(roomCode, displayName) {
        if (!isRealtimeKitRoom()) {
            unmountRealtimeKit();
            return;
        }
        if (!videoClient || !realtimeKitContainer || !realtimeKitMeeting || !videoBox) {
            setMediaState('mediaRealtimeKitUnavailable', { detailKey: 'mediaRealtimeKitDetail', showRetry: true });
            return;
        }
        realtimeKitJoining = true;
        clearSfuFrameLoadTimer();
        sfuFrameLoaded = false;
        if (sfuFrame) {
            sfuFrame.onload = null;
            sfuFrame.onerror = null;
            sfuFrame.src = 'about:blank';
        }
        clearAllMeshMedia();
        videoBox.classList.remove('sfu-mode');
        videoBox.classList.add('realtimekit-mode');
        realtimeKitContainer.hidden = false;
        setMediaState('mediaRealtimeKitLoading', { detailKey: 'mediaRealtimeKitDetail', showRetry: false });
        try {
            await videoClient.joinRealtimeKitRoom({
                roomId: roomCode,
                displayName,
                membershipToken: roomMembershipToken,
                meetingElement: realtimeKitMeeting
            });
            setMediaState('mediaRealtimeKitManaged', { detailKey: 'mediaRealtimeKitDetail', showRetry: false });
        } catch (error) {
            if (error?.code === 'ROOM_MEMBERSHIP_REQUIRED') {
                roomMembershipToken = '';
            }
            const messageKey = SERVER_ERROR_KEYS[error.code] || 'videoProviderUnavailable';
            setMediaState('mediaRealtimeKitUnavailable', { detailKey: messageKey, showRetry: true });
        } finally {
            realtimeKitJoining = false;
        }
    }

    function applyRoomMediaMode(mode, options = {}) {
        roomVideoProvider = normalizeVideoProvider(options.videoProvider || roomVideoProvider || runtimeConfig.videoProvider);
        roomVideoPolicy = options.videoPolicy || roomVideoPolicy || runtimeConfig.videoPolicy || null;
        roomMediaMode = normalizeMediaMode(mode);
        roomParticipantLimit = roomVideoProvider === VIDEO_PROVIDER_MESH && roomMediaMode === MEDIA_MODE_MESH
            ? getMeshParticipantLimit(options.participantLimit)
            : null;
        updateMediaModeBadge();

        if (isRealtimeKitRoom()) {
            disableCamera({ notify: false, preserveStatusText: true });
            clearAllMeshMedia();
            unmountSfuFrame();
            if (videoBox) {
                videoBox.classList.add('realtimekit-mode');
            }
            if (realtimeKitContainer) {
                realtimeKitContainer.hidden = false;
            }
            aiStatusEl.textContent = langDict[curLang].aiSfuUnavailable;
            setAiDotState('neutral');
            setMediaState('mediaRealtimeKitLoading', { detailKey: 'mediaRealtimeKitDetail', showRetry: false });
        } else if (isSfuRoom()) {
            unmountRealtimeKit();
            disableCamera({ notify: false, preserveStatusText: true });
            clearAllMeshMedia();
            if (videoBox) {
                videoBox.classList.add('sfu-mode');
            }
            aiStatusEl.textContent = langDict[curLang].aiSfuUnavailable;
            setAiDotState('neutral');
            setMediaState('mediaSfuLoading', { detailKey: 'aiSfuUnavailable', showRetry: false });
        } else {
            unmountRealtimeKit();
            unmountSfuFrame();
            aiStatusEl.textContent = cameraEnabled ? langDict[curLang].aiReady : langDict[curLang].aiNeedCamera;
            if (!cameraEnabled) {
                setAiDotState('neutral');
            }
        }
        updateCameraToggleLabel();
    }

    function applyJoinedRoom(room = {}) {
        if (room.roomId) {
            roomId = room.roomId;
            joinRoomInput.value = room.roomId;
        }
        applyRoomMediaMode(room.mediaMode, {
            participantLimit: room.participantLimit,
            videoProvider: room.videoProvider,
            videoPolicy: room.videoPolicy
        });
        roomSchedule = room.schedule || null;
        applyScheduleDefaults(roomSchedule);
        renderScheduleCard();
        updateRoomBadge();
    }

    function applyRuntimeConfig(payload = {}) {
        const trimmedSfuBaseUrl = typeof payload.sfuBaseUrl === 'string'
            ? payload.sfuBaseUrl.trim().replace(/\/$/, '')
            : '';
        runtimeConfig = {
            sfuAvailable: !!payload.sfuAvailable && !!trimmedSfuBaseUrl,
            supportedMediaModes: Array.isArray(payload.supportedMediaModes) && payload.supportedMediaModes.length
                ? payload.supportedMediaModes.map(normalizeMediaMode)
                : [MEDIA_MODE_MESH],
            meshParticipantLimit: getMeshParticipantLimit(payload.meshParticipantLimit),
            videoProvider: normalizeVideoProvider(payload.videoProvider),
            videoPolicy: payload.videoPolicy || null,
            publicApiBaseUrl: typeof payload.publicApiBaseUrl === 'string' ? payload.publicApiBaseUrl : ''
        };
        roomVideoProvider = runtimeConfig.videoProvider;
        roomVideoPolicy = runtimeConfig.videoPolicy;
        if (videoClient && typeof videoClient.setApiBaseUrl === 'function') {
            videoClient.setApiBaseUrl(runtimeConfig.publicApiBaseUrl || window.HALASTUDY_CONFIG?.API_BASE_URL || '');
        }
        roomParticipantLimit = isMeshRoom() ? getMeshParticipantLimit(roomParticipantLimit) : null;
        sfuBaseUrl = runtimeConfig.sfuAvailable ? trimmedSfuBaseUrl : '';
        updateMediaModeBadge();
    }

    function updateMeshConnectionState() {
        if (!isMeshRoom()) return;
        const pcs = [...peerConnections.values()];
        const hasFailed = pcs.some((pc) => ['failed', 'disconnected'].includes(pc.connectionState) || ['failed', 'disconnected'].includes(pc.iceConnectionState));
        if (hasFailed) {
            setMediaState('mediaMeshReconnecting');
            return;
        }
        const hasConnecting = pcs.some((pc) => ['new', 'connecting'].includes(pc.connectionState) || ['new', 'checking'].includes(pc.iceConnectionState));
        if (hasConnecting) {
            setMediaState('mediaMeshConnecting');
            return;
        }
        const hasWeak = pcs.some((pc) => ['completed'].includes(pc.iceConnectionState) && pc.connectionState !== 'connected');
        if (hasWeak) {
            setMediaState('mediaMeshWeak');
            return;
        }
        setMediaState('');
    }

    function applyLanguage() {
        const text = currentCopy();
        document.documentElement.lang = curLang;
        document.documentElement.dir = curLang === 'ar' ? 'rtl' : 'ltr';
        document.body.dataset.lang = curLang;
        document.title = text.pageTitle;
        // Mid-Pomodoro language switch: keep the countdown in the tab title.
        if (timerRunning) updateDisp();

        languageButtons.forEach((button) => {
            button.classList.toggle('active', button.dataset.langValue === curLang);
        });

        document.querySelectorAll('[data-lang]').forEach(el => {
            const key = el.dataset.lang;
            if (text[key]) el.textContent = text[key];
        });
        document.querySelectorAll('[data-lang-placeholder]').forEach(el => {
            const key = el.dataset.langPlaceholder;
            if (text[key]) el.placeholder = text[key];
        });
        document.querySelectorAll('[data-lang-title]').forEach(el => {
            const key = el.dataset.langTitle;
            if (text[key]) {
                el.title = text[key];
                el.setAttribute('aria-label', text[key]);
            }
        });
        updateRemotePlaceholder();
        const hasRemoteBuddy = hasRemoteBuddyOnline();
        if (!remoteVideoSlots.size && remoteStatusEl) {
            remoteStatusEl.textContent = hasRemoteBuddy ? text.remoteOffline : '';
        }
        updateCameraToggleLabel();
        if (isRealtimeKitRoom()) {
            aiStatusEl.textContent = text.aiSfuUnavailable;
        } else if (isSfuRoom()) {
            aiStatusEl.textContent = text.aiSfuUnavailable;
        } else if (!cameraEnabled) {
            aiStatusEl.textContent = aiDetector ? text.aiNeedCamera : text.aiUnsupported;
        }
        updateRemoteNameLabel();
        updateRoomBadge();
        updateMediaModeBadge();
        if (!mediaStatePanel.hidden && mediaStateTextEl.textContent) {
            if (isRealtimeKitRoom() && !realtimeKitJoining) {
                setMediaState('mediaRealtimeKitManaged', { detailKey: 'mediaRealtimeKitDetail' });
            } else if (isRealtimeKitRoom()) {
                setMediaState('mediaRealtimeKitLoading', { detailKey: 'mediaRealtimeKitDetail' });
            } else if (isSfuRoom() && sfuFrameLoaded) {
                setMediaState('mediaSfuManaged', { detailKey: 'aiSfuUnavailable' });
            } else if (isSfuRoom()) {
                setMediaState('mediaSfuLoading', { detailKey: 'aiSfuUnavailable' });
            } else {
                updateMeshConnectionState();
            }
        }
        updatePresenceList();
        updateFocusSummary();
        renderScheduleCard();
        renderBoardFeedback();
        renderBoard({ preserveGoalDraft: isBoardGoalFocused() });
        const placeholder = chatMsgs.querySelector('[data-placeholder]');
        if (placeholder) placeholder.textContent = text.chatEmpty;
        applyStatusLanguage();
        updateChatSystemMessages();
    }

    function setLanguage(lang) {
        curLang = lang === 'en' ? 'en' : 'ar';
        setStoredLanguage(curLang);
        applyLanguage();
    }

    function updateChatSystemMessages() {
        if (!chatMsgs) return;
        const systemMessages = chatMsgs.querySelectorAll('.msg.system');
        systemMessages.forEach(bubble => {
            const messageData = bubble.__messageData;
            if (messageData?.action && messageData.username) {
                const actionKey = messageData.action === 'join' ? 'userJoined' : 'userLeft';
                bubble.textContent = `${messageData.username} ${langDict[curLang][actionKey]}`;
            }
        });
    }

    function getSelfLabel() {
        return currentCopy().meLabel;
    }

    function getPresetLabel(preset) {
        const langKey = STATUS_PRESET_MAP[preset];
        if (!langKey) return '';
        return langDict[curLang][langKey] || '';
    }

    function updateStatusPresetUI(activePreset) {
        if (!statusPresetButtons || typeof statusPresetButtons.forEach !== 'function') return;
        statusPresetButtons.forEach(btn => {
            const target = btn.dataset.status;
            btn.classList.toggle('active', !!activePreset && target === activePreset);
        });
    }

    function setStatusPreset(preset) {
        if (!STATUS_PRESET_MAP[preset]) return;
        statusState.manualPreset = preset;
        statusState.manualText = getPresetLabel(preset) || '';
        if (statusCustomInput) statusCustomInput.value = statusState.manualText;
        updateStatusPresetUI(preset);
        refreshStatusState();
    }

    function updateStatusPreview() {
        if (!statusPreviewEl) return;
        if (!statusState.isShared) {
            statusPreviewEl.textContent = langDict[curLang].statusHidden || '--';
            return;
        }
        const text = buildStatusText();
        statusPreviewEl.textContent = text || '';
    }

    function getTimerStatusText() {
        if (!statusState.autoSync || !timerRunning) return '';
        const key = mode === 'focus' ? 'statusFocus' : 'statusBreak';
        return langDict[curLang][key] || '';
    }

    function getAmbientStatusText() {
        if (!ambientSoundState.showInStatus || !ambientSoundState.type) return '';
        const descriptor = langDict[curLang].soundListening || '';
        const meta = AMBIENT_SOUNDS[ambientSoundState.type];
        const labelKey = meta?.labelKey;
        const label = (labelKey && langDict[curLang][labelKey]) || ambientSoundState.type;
        return descriptor ? `${descriptor} ${label}` : label;
    }

    function buildStatusText() {
        const parts = [];
        const seen = new Set();
        const addPart = (raw) => {
            const normalized = (raw || '').trim();
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            parts.push(normalized);
        };
        addPart(statusState.manualText);
        addPart(getTimerStatusText());
        addPart(getAmbientStatusText());
        return parts.join(' · ');
    }

    function buildStatusPayload() {
        const visible = !!statusState.isShared;
        const payloadText = visible ? buildStatusText() : '';
        return {
            text: payloadText,
            visible,
            goal: visible ? (statusState.goal || '') : '',
            manual: statusState.manualText || '',
            manualPreset: statusState.manualPreset,
            autoSync: !!statusState.autoSync,
            ambientType: ambientSoundState.showInStatus && ambientSoundState.type ? ambientSoundState.type : null,
            timerMode: statusState.autoSync && timerRunning ? mode : null,
            updatedAt: Date.now()
        };
    }

    function refreshStatusState(options = {}) {
        const broadcast = options.broadcast !== false;
        updateStatusPreview();
        saveStatusState();
        if (broadcast) scheduleStatusBroadcast();
    }

    function saveStatusState() {
        try {
            localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify({
                manualText: statusState.manualText,
                manualPreset: statusState.manualPreset,
                goal: statusState.goal,
                autoSync: statusState.autoSync,
                isShared: statusState.isShared
            }));
        } catch (err) {
            debugLog('STORAGE', 'Status save failed', err.message);
        }
    }

    function loadStatusState() {
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(STATUS_STORAGE_KEY) || '{}');
        } catch (err) {
            debugLog('STORAGE', 'Status load failed', err.message);
        }
        if (saved) {
            statusState.manualText = saved.manualText || '';
            statusState.manualPreset = saved.manualPreset || null;
            statusState.goal = typeof saved.goal === 'string' ? saved.goal.slice(0, 80) : '';
            statusState.autoSync = !!saved.autoSync;
            statusState.isShared = saved.isShared !== false;
        }
        if (statusCustomInput) statusCustomInput.value = statusState.manualText;
        if (statusGoalInput) statusGoalInput.value = statusState.goal;
        if (statusAutoSyncToggle) statusAutoSyncToggle.checked = statusState.autoSync;
        if (statusShareToggle) statusShareToggle.checked = statusState.isShared;
        updateStatusPresetUI(statusState.manualPreset);
        updateStatusPreview();
    }

    function applyStatusLanguage() {
        if (statusState.manualPreset && STATUS_PRESET_MAP[statusState.manualPreset]) {
            statusState.manualText = getPresetLabel(statusState.manualPreset);
            if (statusCustomInput) statusCustomInput.value = statusState.manualText;
        }
        refreshStatusState();
        renderUserList();
    }

    function scheduleStatusBroadcast() {
        if (!socket || !roomId) return;
        if (statusBroadcastTimer) clearTimeout(statusBroadcastTimer);
        statusBroadcastTimer = setTimeout(() => {
            statusBroadcastTimer = null;
            broadcastStatus();
        }, 350);
    }

    function broadcastStatus() {
        if (!socket || !roomId) return;
        const payload = buildStatusPayload();
        socket.emit('user-status', { status: payload }, (ack = {}) => {
            if (ack?.ok) {
                statusState.lastUpdated = payload.updatedAt;
            }
        });
    }

    function isHiddenPeer(record) {
        if (!record) return false;
        return hiddenPeers.ids.has(record.id) || (record.name && hiddenPeers.names.has(record.name));
    }

    function reportUser(targetId, targetName, reason) {
        if (!socket || !roomId) return;
        socket.emit('report-user', { targetId, reason }, (ack = {}) => {
            pendingReportTargetId = null;
            if (ack?.ok) {
                hiddenPeers.ids.add(targetId);
                if (targetName) hiddenPeers.names.add(targetName);
                const slot = remoteVideoSlots.get(targetId);
                if (slot) slot.tile.classList.add('is-hidden');
                renderMessages(chatHistoryCache);
                if (window.HalaUI) window.HalaUI.toast(currentCopy().reportConfirmToast, { duration: 6000 });
            } else if (window.HalaUI) {
                const key = ack && ack.errorCode === 'RATE_LIMITED' ? 'reportRateLimited' : 'reportErrorGeneric';
                window.HalaUI.toast(currentCopy()[key], { kind: 'error', duration: 6000 });
            }
            renderUserList();
        });
    }

    function renderUserList() {
        if (!userListEl) return;
        const list = Array.isArray(presenceCache) ? presenceCache : [];
        userListEl.innerHTML = '';
        if (userListCountEl) userListCountEl.textContent = String(list.length || 0);
        if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'user-empty';
            empty.textContent = langDict[curLang].presenceEmpty;
            userListEl.appendChild(empty);
            return;
        }
        const selfId = socket?.id;
        list.forEach(person => {
            const record = participantsMap.get(person.id) || person;
            const item = document.createElement('div');
            item.className = 'user-item';
            const dot = document.createElement('span');
            dot.className = 'user-dot online';
            item.appendChild(dot);
            const body = document.createElement('div');
            body.className = 'user-body';
            const nameRow = document.createElement('div');
            nameRow.className = 'user-name-row';
            const nameEl = document.createElement('span');
            nameEl.className = 'user-name';
            nameEl.textContent = record.name || currentCopy().guestLabel;
            nameRow.appendChild(nameEl);
            if (selfId && record.id === selfId) {
                const tag = document.createElement('span');
                tag.className = 'user-self';
                tag.textContent = getSelfLabel();
                nameRow.appendChild(tag);
            } else if (isHiddenPeer(record)) {
                const tag = document.createElement('span');
                tag.className = 'user-hidden-tag';
                tag.textContent = langDict[curLang].userHiddenTag;
                nameRow.appendChild(tag);
            } else if (selfId) {
                const reportBtn = document.createElement('button');
                reportBtn.type = 'button';
                reportBtn.className = 'user-report-btn';
                reportBtn.textContent = langDict[curLang].reportUser;
                reportBtn.addEventListener('click', () => {
                    pendingReportTargetId = pendingReportTargetId === record.id ? null : record.id;
                    renderUserList();
                });
                nameRow.appendChild(reportBtn);
            }
            body.appendChild(nameRow);
            if (pendingReportTargetId === record.id && !isHiddenPeer(record)) {
                const reasons = document.createElement('div');
                reasons.className = 'report-reasons';
                Object.keys(REPORT_REASON_KEYS).forEach(reason => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'report-reason-btn';
                    btn.textContent = langDict[curLang][REPORT_REASON_KEYS[reason]];
                    btn.addEventListener('click', () => reportUser(record.id, record.name, reason));
                    reasons.appendChild(btn);
                });
                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'report-reason-btn report-cancel-btn';
                cancelBtn.textContent = langDict[curLang].reportCancel;
                cancelBtn.addEventListener('click', () => {
                    pendingReportTargetId = null;
                    renderUserList();
                });
                reasons.appendChild(cancelBtn);
                body.appendChild(reasons);
            }
            const statusLine = document.createElement('div');
            statusLine.className = 'user-status-text';
            if (record.status && record.status.visible === false) {
                statusLine.textContent = langDict[curLang].statusHidden;
            } else {
                const text = record.status?.text ? record.status.text : '';
                statusLine.textContent = text || '';
            }
            body.appendChild(statusLine);
            if (record.status && record.status.visible !== false && record.status.goal) {
                const goalLine = document.createElement('div');
                goalLine.className = 'user-goal-text';
                goalLine.textContent = `🎯 ${record.status.goal}`;
                body.appendChild(goalLine);
            }
            item.appendChild(body);
            userListEl.appendChild(item);
        });
    }

    function saveAmbientState() {
        try {
            localStorage.setItem(AMBIENT_STORAGE_KEY, JSON.stringify({
                type: ambientSoundState.type,
                enabled: ambientSoundState.enabled,
                volume: ambientSoundState.volume,
                showInStatus: ambientSoundState.showInStatus
            }));
        } catch (err) {
            debugLog('STORAGE', 'Ambient save failed', err.message);
        }
    }

    function loadAmbientState() {
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(AMBIENT_STORAGE_KEY) || '{}');
        } catch (err) {
            debugLog('STORAGE', 'Ambient load failed', err.message);
        }
        if (saved) {
            ambientSoundState.type = saved.type || null;
            ambientSoundState.volume = typeof saved.volume === 'number' ? saved.volume : 0.5;
            ambientSoundState.showInStatus = saved.showInStatus !== false;
        }
        if (ambientVolumeInput && typeof ambientSoundState.volume === 'number') {
            ambientVolumeInput.value = String(ambientSoundState.volume);
        }
        if (ambientStatusShareToggle) ambientStatusShareToggle.checked = ambientSoundState.showInStatus;
        const selectedType = ambientSoundState.type || (ambientSoundState.enabled ? ambientSoundState.type : 'none');
        updateAmbientListUI(selectedType);
        if (saved?.enabled && ambientSoundState.type) {
            selectAmbientSound(ambientSoundState.type, { skipSave: true, autoplay: true });
        } else {
            stopAmbientSound();
            refreshStatusState({ broadcast: false });
        }
    }

    function updateAmbientListUI(selected) {
        if (!ambientListEl) return;
        ambientListEl.querySelectorAll('li').forEach(li => {
            li.classList.toggle('active', li.dataset.sound === selected);
        });
    }

    function stopAmbientSound() {
        if (ambientSoundState.audio) {
            try { ambientSoundState.audio.pause(); } catch (_) {}
            try { ambientSoundState.audio.currentTime = 0; } catch (_) {}
        }
        ambientSoundState.audio = null;
        ambientSoundState.enabled = false;
    }

    function selectAmbientSound(type, options = {}) {
        const skipSave = options.skipSave || false;
        const autoplay = options.autoplay !== false;
        if (!type || type === 'none') {
            stopAmbientSound();
            ambientSoundState.type = null;
            updateAmbientListUI('none');
            if (!skipSave) saveAmbientState();
            refreshStatusState();
            return;
        }
        const sound = AMBIENT_SOUNDS[type];
        if (!sound) {
            stopAmbientSound();
            ambientSoundState.type = null;
            updateAmbientListUI('none');
            refreshStatusState();
            return;
        }
        ambientSoundState.type = type;
        let audio = ambientSoundState.cache[type];
        if (!audio) {
            audio = new Audio(sound.src);
            audio.loop = true;
            audio.preload = 'auto';
            audio.crossOrigin = 'anonymous';
            ambientSoundState.cache[type] = audio;
        }
        if (ambientSoundState.audio && ambientSoundState.audio !== audio) {
            try { ambientSoundState.audio.pause(); } catch (_) {}
        }
        ambientSoundState.audio = audio;
        audio.volume = ambientSoundState.volume;
        if (autoplay) {
            audio.currentTime = 0;
            audio.play().then(() => {
                ambientSoundState.enabled = true;
                updateAmbientListUI(type);
                if (!skipSave) saveAmbientState();
                refreshStatusState();
            }).catch(err => {
                ambientSoundState.enabled = false;
                debugLog('AMBIENT', 'Playback blocked', err.message);
                updateAmbientListUI(type);
                if (!skipSave) saveAmbientState();
                refreshStatusState();
            });
        } else {
            ambientSoundState.enabled = false;
            updateAmbientListUI(type);
            if (!skipSave) saveAmbientState();
            refreshStatusState();
        }
    }

    function toggleAmbientPopover(force) {
        if (!ambientPopover) return;
        const shouldShow = typeof force === 'boolean' ? force : ambientPopover.hasAttribute('hidden');
        if (shouldShow) ambientPopover.removeAttribute('hidden');
        else ambientPopover.setAttribute('hidden', '');
        if (ambientToggleBtn) ambientToggleBtn.setAttribute('aria-expanded', String(shouldShow));
    }

    function handleAmbientOutsideClick(event) {
        if (!ambientPopover || ambientPopover.hasAttribute('hidden')) return;
        if (ambientPopover.contains(event.target)) return;
        if (ambientToggleBtn?.contains(event.target)) return;
        toggleAmbientPopover(false);
    }

    function toggleRemoteVideoCollapse() {
        if (!videoBoxEl || !videoCollapseBanner) return;
        if (collapseRemoteTimeout) clearTimeout(collapseRemoteTimeout);
        collapseRemoteTimeout = setTimeout(() => {
            const hasAnyVideo = cameraEnabled || remoteVideoSlots.size > 0;
            const shouldCollapse = !hasAnyVideo;
            videoBoxEl.classList.toggle('collapsed', shouldCollapse);
            if (shouldCollapse) videoCollapseBanner.removeAttribute('hidden');
            else videoCollapseBanner.setAttribute('hidden', '');
        }, 300);
    }

    function playTimerNotification(type) {
        const audio = TIMER_NOTIFICATION_SOUNDS[type];
        if (!audio) {
            debugLog('NOTIFICATION', `Unknown notification type: ${type}`);
            return;
        }
        audio.currentTime = 0;
        audio.play().then(() => {
            debugLog('NOTIFICATION', `Playing ${type} notification`);
        }).catch(err => {
            debugLog('NOTIFICATION', `Failed to play ${type} notification`, err.message);
        });
    }

    // --- Focus Statistics ---
    function getLocalDateKey() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function updateFocusSummary() {
        if (!focusTotalEl) return;
        ensureFocusStatsFresh();
        const total = Math.max(0, focusStats.totalSeconds || 0);
        const totalMinutes = Math.floor(total / 60);
        focusTotalEl.textContent = formatFocusMinutes(totalMinutes);
    }

    function saveFocusStats() {
        try {
            localStorage.setItem(FOCUS_STATS_KEY, JSON.stringify(focusStats));
        } catch (err) {
            debugLog('STORAGE', 'Focus stats save failed', err.message);
        }
    }

    function ensureFocusStatsFresh() {
        const today = getLocalDateKey();
        if (focusStats.date !== today) {
            focusStats = { date: today, totalSeconds: 0 };
            saveFocusStats();
        }
    }

    function scheduleFocusStatsReset() {
        if (focusStatsResetTimer) clearTimeout(focusStatsResetTimer);
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const delay = Math.max(1000, midnight.getTime() - now.getTime());
        focusStatsResetTimer = setTimeout(() => resetFocusStats(), delay);
    }

    function resetFocusStats() {
        focusStats = { date: getLocalDateKey(), totalSeconds: 0 };
        saveFocusStats();
        updateFocusSummary();
        scheduleFocusStatsReset();
    }

    function addFocusSeconds(seconds) {
        if (!seconds || seconds <= 0) return;
        ensureFocusStatsFresh();
        focusStats.totalSeconds += seconds;
        saveFocusStats();
        updateFocusSummary();
    }

    function loadFocusStats() {
        const today = getLocalDateKey();
        focusStats = { date: today, totalSeconds: 0 };
        try {
            const saved = JSON.parse(localStorage.getItem(FOCUS_STATS_KEY) || 'null');
            if (saved && saved.date === today && typeof saved.totalSeconds === 'number') {
                focusStats.totalSeconds = Math.max(0, saved.totalSeconds);
            }
        } catch (err) {
            debugLog('STORAGE', 'Focus stats load failed', err.message);
        }
        updateFocusSummary();
        scheduleFocusStatsReset();
    }

    /* ---------- account integration (signed-in unlocks) ---------- */
    // Muted member accents — rendered only on user content (tile ring, chat
    // dot), never chrome, so the single-accent rule stays intact.
    const AVATAR_ACCENTS = {
        amber: 'rgba(224, 176, 139, 0.9)',
        sage: 'rgba(90, 140, 92, 0.85)',
        terracotta: 'rgba(199, 85, 69, 0.85)',
        dusk: 'rgba(108, 143, 173, 0.85)',
        sand: 'rgba(212, 162, 86, 0.85)',
        stone: 'rgba(154, 160, 164, 0.85)'
    };
    const FOCUS_HINT_DISMISS_KEY = 'halastudyHintDismissed.focusSync';
    let accountUser = null;

    function formatEmotionalNumber(value) {
        // Streaks are emotional numbers — Eastern numerals in Arabic (DESIGN.md §5).
        return curLang === 'ar' ? new Intl.NumberFormat('ar-EG').format(value) : String(value);
    }

    function updateStreakBadge() {
        const badge = document.getElementById('streak-badge');
        if (!badge) return;
        const current = accountUser?.streak ? accountUser.streak.current : 0;
        if (!current) {
            badge.hidden = true;
            return;
        }
        badge.textContent = `${currentCopy().streakBadgeLabel} ${formatEmotionalNumber(current)}`;
        badge.hidden = false;
    }

    function maybeShowFocusSyncHint() {
        if (accountUser) return;
        try {
            if (localStorage.getItem(FOCUS_HINT_DISMISS_KEY)) return;
        } catch (_err) { /* storage unavailable */ }
        const hint = document.getElementById('focus-sync-hint');
        if (!hint) return;
        const link = document.getElementById('focus-sync-link');
        if (link) {
            link.href = `/account.html?signup=1&next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }
        hint.hidden = false;
    }

    function onFocusSessionComplete(minutes) {
        if (accountUser && window.HalaCore) {
            // One immutable idempotency key belongs to this timer completion.
            // If this request is retried, reuse this payload rather than minting
            // another key; a later completed timer calls this function anew.
            const completion = { minutes, completionId: crypto.randomUUID() };
            window.HalaCore.postJson('/api/me/focus-session', completion)
                .then((payload) => {
                    accountUser.streak = payload.streak;
                    updateStreakBadge();
                })
                .catch(() => { /* offline — local stats still counted */ });
        } else {
            maybeShowFocusSyncHint();
        }
    }

    function applyMemberAccents() {
        (presenceCache || []).forEach((participant) => {
            if (!participant?.id) return;
            const slot = remoteVideoSlots.get(participant.id);
            if (!slot?.tile) return;
            const accent = participant.avatarColor ? AVATAR_ACCENTS[participant.avatarColor] : null;
            slot.tile.style.outline = accent ? `2px solid ${accent}` : '';
            slot.tile.style.outlineOffset = accent ? '-2px' : '';
        });
    }

    function getAccentForName(name) {
        const match = (presenceCache || []).find((participant) => participant && participant.name === name && participant.avatarColor);
        return match ? (AVATAR_ACCENTS[match.avatarColor] || null) : null;
    }

    function initAccountIntegration() {
        const dismissBtn = document.getElementById('focus-sync-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                const hint = document.getElementById('focus-sync-hint');
                if (hint) hint.hidden = true;
                try {
                    localStorage.setItem(FOCUS_HINT_DISMISS_KEY, String(Date.now()));
                } catch (_err) { /* storage unavailable */ }
            });
        }
        if (!window.HalaAuth) return;
        window.HalaAuth.getUser().then((user) => {
            accountUser = user;
            if (!user) return;
            try {
                localStorage.setItem('halastudyName', user.displayName);
            } catch (_err) { /* storage unavailable */ }
            const joinNameInput = document.getElementById('join-name');
            if (joinNameInput && !joinNameInput.value) {
                joinNameInput.value = user.displayName;
            }
            const reserved = document.getElementById('join-name-reserved');
            if (reserved) reserved.hidden = false;
            updateStreakBadge();
        });
    }

    function createEmptyBoardState() {
        return { goal: '', tasks: [] };
    }

    function normalizeBoardTask(task = {}) {
        const text = typeof task.text === 'string' ? task.text.trim().slice(0, BOARD_TASK_MAX_LENGTH) : '';
        if (!text) return null;
        const priority = [1, 2, 3].includes(Number(task.priority)) ? Number(task.priority) : 2;
        const fallbackId = `board-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        return {
            id: typeof task.id === 'string' && task.id.trim() ? task.id.trim() : fallbackId,
            text,
            priority,
            done: !!task.done
        };
    }

    function normalizeBoardState(board = {}) {
        const goal = typeof board.goal === 'string' ? board.goal.trim().slice(0, BOARD_GOAL_MAX_LENGTH) : '';
        const tasks = Array.isArray(board.tasks) ? board.tasks.map(normalizeBoardTask).filter(Boolean) : [];
        return { goal, tasks };
    }

    function renderBoardFeedback() {
        if (!boardFeedbackEl) return;
        boardFeedbackEl.textContent = boardFeedbackKey ? (currentCopy()[boardFeedbackKey] || currentCopy().boardErrorGeneric || '') : '';
    }

    function setBoardFeedbackKey(key = '') {
        boardFeedbackKey = key || '';
        renderBoardFeedback();
    }

    function clearBoardFeedback() {
        setBoardFeedbackKey('');
    }

    function isBoardGoalFocused() {
        return document.activeElement === roomGoalInput;
    }

    function updateBoardPriorityUI() {
        priorityButtons.forEach((button) => {
            const dot = button.querySelector('.color-dot');
            const isActive = Number(button.dataset.priority) === selectedBoardPriority;
            if (dot) dot.classList.toggle('active', isActive);
        });
    }

    function setBoardPriority(priority) {
        selectedBoardPriority = [1, 2, 3].includes(Number(priority)) ? Number(priority) : 2;
        updateBoardPriorityUI();
    }

    function getBoardPriorityColor(priority) {
        if (priority === 3) return 'var(--prio-high)';
        if (priority === 1) return 'var(--prio-low)';
        return 'var(--prio-med)';
    }

    function updateBoardStats() {
        const total = boardState.tasks.length;
        const done = boardState.tasks.filter((task) => task.done).length;
        if (totalCountEl) totalCountEl.textContent = String(total);
        if (doneCountEl) doneCountEl.textContent = String(done);
        if (progressBarEl) progressBarEl.style.width = `${total ? (done / total) * 100 : 0}%`;
    }

    function buildBoardTaskNode(task) {
        const item = document.createElement('div');
        item.className = `todo-item${task.done ? ' done' : ''}`;
        item.draggable = boardEnabled;
        item.dataset.taskId = task.id;
        item.dataset.prio = String(task.priority);

        const main = document.createElement('div');
        main.className = 'todo-item-main';

        const prioLine = document.createElement('div');
        prioLine.className = 'prio-line';
        prioLine.style.background = getBoardPriorityColor(task.priority);

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'check-circle';
        toggleBtn.disabled = !boardEnabled;
        toggleBtn.addEventListener('click', () => toggleBoardTask(task.id, !task.done));

        const text = document.createElement('span');
        text.className = 'todo-text';
        text.textContent = task.text;

        main.appendChild(prioLine);
        main.appendChild(toggleBtn);
        main.appendChild(text);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'todo-delete';
        deleteBtn.textContent = '×';
        deleteBtn.disabled = !boardEnabled;
        deleteBtn.title = currentCopy().todoDeleteTitle;
        deleteBtn.setAttribute('aria-label', currentCopy().todoDeleteTitle);
        deleteBtn.addEventListener('click', () => deleteBoardTask(task.id));

        item.appendChild(main);
        item.appendChild(deleteBtn);

        if (boardEnabled) {
            item.addEventListener('dragstart', () => item.classList.add('dragging'));
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                syncBoardOrderFromDom();
            });
        }

        return item;
    }

    function renderBoard(options = {}) {
        if (!todoList) return;
        const preserveGoalDraft = options.preserveGoalDraft === true;
        if (roomGoalInput && !preserveGoalDraft) {
            roomGoalInput.value = boardState.goal;
        }
        todoList.innerHTML = '';
        if (!boardState.tasks.length) {
            const empty = document.createElement('div');
            empty.className = 'todo-empty';
            empty.textContent = currentCopy().sharedTaskEmpty;
            todoList.appendChild(empty);
        } else {
            boardState.tasks.forEach((task) => {
                todoList.appendChild(buildBoardTaskNode(task));
            });
        }
        updateBoardStats();
        updateBoardPriorityUI();
    }

    function setBoardState(nextBoard, options = {}) {
        boardState = normalizeBoardState(nextBoard);
        renderBoard(options);
    }

    function setBoardEnabled(enabled) {
        boardEnabled = !!enabled;
        if (sharedBoardCard) sharedBoardCard.classList.toggle('is-disabled', !boardEnabled);
        if (roomGoalInput) roomGoalInput.disabled = !boardEnabled;
        if (newTaskInput) newTaskInput.disabled = !boardEnabled;
        if (addTaskBtn) addTaskBtn.disabled = !boardEnabled;
        priorityButtons.forEach((button) => {
            button.disabled = !boardEnabled;
        });
        renderBoard({ preserveGoalDraft: isBoardGoalFocused() });
        if (!boardEnabled) clearBoardFeedback();
    }

    function emitBoardMutation(eventName, payload, options = {}) {
        if (!socket || !roomId || !boardEnabled) return;
        socket.emit(eventName, payload, (ack = {}) => {
            if (ack.ok) {
                clearBoardFeedback();
                return;
            }
            setBoardFeedbackKey(SERVER_ERROR_KEYS[ack.errorCode] || options.fallbackKey || 'boardErrorGeneric');
            if (typeof options.onError === 'function') {
                options.onError(ack);
            }
        });
    }

    function commitBoardGoal() {
        if (!roomGoalInput || !boardEnabled) return;
        const goal = roomGoalInput.value.trim().slice(0, BOARD_GOAL_MAX_LENGTH);
        roomGoalInput.value = goal;
        if (goal === boardState.goal) return;
        emitBoardMutation('board-set-goal', { goal }, { fallbackKey: 'boardErrorGeneric' });
    }

    function addBoardTask() {
        if (!newTaskInput || !boardEnabled) return;
        const text = newTaskInput.value.trim().slice(0, BOARD_TASK_MAX_LENGTH);
        if (!text) {
            setBoardFeedbackKey('boardTaskRequired');
            return;
        }
        newTaskInput.value = '';
        emitBoardMutation('board-add-task', { text, priority: selectedBoardPriority }, {
            fallbackKey: 'boardErrorGeneric',
            onError: () => {
                newTaskInput.value = text;
            }
        });
    }

    function toggleBoardTask(taskId, done) {
        emitBoardMutation('board-toggle-task', { taskId, done }, { fallbackKey: 'boardErrorGeneric' });
    }

    function deleteBoardTask(taskId) {
        emitBoardMutation('board-delete-task', { taskId }, { fallbackKey: 'boardErrorGeneric' });
    }

    function syncBoardOrderFromDom() {
        if (!todoList || !socket || !roomId || !boardEnabled) return;
        const orderedTaskIds = [...todoList.querySelectorAll('.todo-item')].map((item) => item.dataset.taskId).filter(Boolean);
        const currentOrder = boardState.tasks.map((task) => task.id);
        if (orderedTaskIds.length !== currentOrder.length) {
            renderBoard();
            return;
        }
        if (orderedTaskIds.every((taskId, index) => taskId === currentOrder[index])) {
            return;
        }
        socket.emit('board-reorder-tasks', { taskIds: orderedTaskIds }, (ack = {}) => {
            if (ack.ok) {
                clearBoardFeedback();
                return;
            }
            setBoardFeedbackKey(SERVER_ERROR_KEYS[ack.errorCode] || 'boardErrorGeneric');
            renderBoard();
        });
    }

    if (todoList) {
        todoList.addEventListener('dragover', (event) => {
            if (!boardEnabled) return;
            event.preventDefault();
            const afterEl = getDragAfterElement(todoList, event.clientY);
            const dragging = todoList.querySelector('.dragging');
            if (!dragging) return;
            if (afterEl == null) todoList.appendChild(dragging);
            else todoList.insertBefore(dragging, afterEl);
        });
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.todo-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) return { offset, element: child };
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    let timer = null;
    let timerDeadline = null;
    let timerDurations = { focus: 25, break: 5 };
    let mode = 'focus';
    let timeLeft = 25 * 60;

    function readTimerMinutes(inputId, fallback) {
        const value = parseInt(document.getElementById(inputId).value, 10);
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }

    function updateDisp() {
        const m = Math.floor(timeLeft/60).toString().padStart(2,'0');
        const s = (timeLeft%60).toString().padStart(2,'0');
        document.getElementById('timer-disp').textContent = `${m}:${s}`;
        // Tab-title countdown while running (Western digits per DESIGN.md §5).
        document.title = timerRunning ? `${m}:${s} · Halastudy` : currentCopy().pageTitle;
    }

    function advanceTimerPhase(nextPhaseStartedAt = timerDeadline) {
        const completedMode = mode;
        const notificationType = completedMode === 'focus' ? 'focusEnd' : 'breakEnd';
        playTimerNotification(notificationType);

        if (completedMode === 'focus') {
            addFocusSeconds(timerDurations.focus * 60);
            // Signed in: sync to the account (streaks). Guest:
            // quiet one-time nudge that these minutes are local-only.
            onFocusSessionComplete(timerDurations.focus);
            if (statusState.goal && window.HalaUI) {
                // FSI/PDI isolate the user-entered goal so mixed
                // AR/EN text doesn't reorder around the AR copy.
                window.HalaUI.toast(`${currentCopy().goalRecapToast} ⁨${statusState.goal}⁩`, { duration: 8000 });
            }
        }

        mode = completedMode === 'focus' ? 'break' : 'focus';
        timeLeft = timerDurations[mode] * 60;
        timerDeadline = nextPhaseStartedAt + timeLeft * 1000;
        document.getElementById('tab-focus').className = mode === 'focus' ? 'timer-tab active' : 'timer-tab';
        document.getElementById('tab-break').className = mode === 'break' ? 'timer-tab active' : 'timer-tab';
        if (statusState.autoSync) refreshStatusState();
    }

    function reconcileTimer(now = performance.now()) {
        if (!timerRunning || timerDeadline === null) return;

        // A suspended tab may resume hours later. Complete only the phase the
        // student actually started, then begin the next phase at resume time;
        // never manufacture unattended focus completions for skipped cycles.
        if (now >= timerDeadline) advanceTimerPhase(now);
        timeLeft = Math.max(0, Math.ceil((timerDeadline - now) / 1000));
        updateDisp();
    }

    function toggleTimer() {
        const btn = document.getElementById('btn-toggle');
        if(timer) {
            reconcileTimer();
            clearInterval(timer); timer = null;
            timerDeadline = null;
            btn.textContent = '▶';
            btn.style.boxShadow = 'var(--shadow-btn)';
            timerRunning = false;
            refreshStatusState();
            updateDisp();
        } else {
            timerDurations = {
                focus: readTimerMinutes('cfg-f', 25),
                break: readTimerMinutes('cfg-b', 5)
            };
            if(timeLeft === 25*60 && mode === 'focus') timeLeft = timerDurations.focus * 60;
            btn.textContent = '⏸';
            btn.style.boxShadow = 'var(--shadow-btn-inset)';
            timerRunning = true;
            timerDeadline = performance.now() + timeLeft * 1000;
            refreshStatusState();
            updateDisp();
            timer = setInterval(reconcileTimer, 1000);
        }
    }

    function resetTimer() {
        clearInterval(timer); timer = null;
        timerDeadline = null;
        document.getElementById('btn-toggle').textContent = '▶';
        mode = 'focus';
        timeLeft = readTimerMinutes('cfg-f', 25) * 60;
        timerRunning = false;
        updateDisp();
        refreshStatusState();
        updatePresetActiveState();
    }

    // 25/5, 50/10, 90/15 one-click presets. Always route through resetTimer():
    // toggleTimer() only re-reads cfg-f when timeLeft is at the untouched
    // default, so setting the inputs alone would silently not apply.
    function applyTimerPreset(focusMinutes, breakMinutes) {
        document.getElementById('cfg-f').value = String(focusMinutes);
        document.getElementById('cfg-b').value = String(breakMinutes);
        resetTimer();
    }

    function updatePresetActiveState() {
        const presetsEl = document.getElementById('timer-presets');
        if (!presetsEl) return;
        const focusVal = parseInt(document.getElementById('cfg-f').value, 10) || 25;
        const breakVal = parseInt(document.getElementById('cfg-b').value, 10) || 5;
        presetsEl.querySelectorAll('.timer-preset-chip').forEach(chip => {
            const match = parseInt(chip.dataset.focus, 10) === focusVal && parseInt(chip.dataset.break, 10) === breakVal;
            chip.classList.toggle('active', match);
        });
    }

    function generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        return Array.from({length: 6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    }

    function updateRoomBadge() {
        roomCodeVal.textContent = roomId || '---';
        updateMediaModeBadge();
    }

    function updatePresenceText() {
        presenceCountEl.textContent = String(presenceCount);
    }

    function updatePresenceList(list) {
        if (Array.isArray(list)) {
            const merged = list.map(p => Object.assign({}, participantsMap.get(p.id) || {}, p));
            presenceCache = merged;
            participantsMap = new Map(merged.map(p => [p.id, p]));
            merged.forEach(p => {
                if (p && typeof p.cameraOn === 'boolean') {
                    remoteCameraStates.set(p.id, p.cameraOn);
                }
            });
            prunePeers(merged.map(p => p.id));
            list = merged;
        } else {
            list = presenceCache;
        }
        presenceCount = list.length;
        updatePresenceText();
        if(list.length) {
            presenceNamesEl.textContent = list.map(p => p.name).join(' - ');
        } else {
            presenceNamesEl.textContent = langDict[curLang].presenceEmpty;
        }
        updateRemoteNameLabel();
        renderUserList();
        applyMemberAccents();
        if (!isMeshRoom()) {
            return;
        }
        const myId = socket?.id;
        if (socket) {
            list.forEach(p => {
                if (p.id !== myId && !peerConnections.has(p.id) && shouldInitiate(p.id)) {
                    createOffer(p.id);
                }
            });
        }
    }

    function handleStatusUpdate(payload = {}) {
        const { userId, status } = payload;
        if (!userId) return;
        const existing = participantsMap.get(userId) || { id: userId };
        existing.status = status;
        participantsMap.set(userId, existing);
        if (!Array.isArray(presenceCache)) presenceCache = [];
        presenceCache = presenceCache.map(user => user.id === userId ? Object.assign({}, user, { status }) : user);
        renderUserList();
    }

    function prunePeers(activeIds = []) {
        const activeSet = new Set(activeIds);
        peerConnections.forEach((pc, id) => {
            if (!activeSet.has(id)) {
                pc.close();
                peerConnections.delete(id);
                remoteCameraStates.delete(id);
                pendingIceCandidates.delete(id);
                clearRemoteStream(id);
            }
        });
        updateMeshConnectionState();
    }

    function getRemoteDisplayName(userId) {
        if (participantsMap.has(userId)) {
            return participantsMap.get(userId).name;
        }
        return langDict[curLang].camPeer;
    }

    function hasRemoteBuddyOnline() {
        return [...participantsMap.keys()].some(id => !socket || id !== socket.id);
    }

    function updateRemotePlaceholder(customText) {
        if (!remotePlaceholder) return;
        const hasRemoteFeed = remoteVideoSlots.size > 0;
        remotePlaceholder.style.display = hasRemoteFeed ? 'none' : 'flex';
        if (!hasRemoteFeed) {
            remotePlaceholder.textContent = customText || langDict[curLang].remoteWaiting;
        }
        toggleRemoteVideoCollapse();
    }

    function updateRemoteNameLabel() {
        if (!remoteNameLabel) return;
        const names = [...remoteVideoSlots.keys()].map(getRemoteDisplayName);
        remoteNameLabel.textContent = names.length ? names.join(', ') : langDict[curLang].camPeer;
    }

    function showChatPlaceholder() {
        chatMsgs.innerHTML = '';
        const placeholder = document.createElement('div');
        placeholder.className = 'msg system';
        placeholder.dataset.placeholder = 'true';
        placeholder.textContent = langDict[curLang].chatEmpty;
        chatMsgs.appendChild(placeholder);
    }

    function clearChatPlaceholder() {
        const placeholder = chatMsgs.querySelector('[data-placeholder]');
        if (placeholder) placeholder.remove();
    }

    function buildMessageNode(message) {
        const bubble = document.createElement('div');
        bubble.classList.add('msg');
        if (message.type === 'system') {
            bubble.classList.add('system');
            // Store message data for language updates
            if (message.action && message.username) {
                bubble.__messageData = { action: message.action, username: message.username };
                const actionKey = message.action === 'join' ? 'userJoined' : 'userLeft';
                bubble.textContent = `${message.username} ${langDict[curLang][actionKey]}`;
            } else {
                bubble.textContent = message.text;
            }
        } else {
            const isMine = message.author === username;
            bubble.classList.add(isMine ? 'r' : 'l');
            const authorEl = document.createElement('span');
            authorEl.className = 'msg-author';
            authorEl.textContent = message.author || (isMine ? username : currentCopy().guestLabel);
            const accent = getAccentForName(message.author);
            if (accent) {
                const dot = document.createElement('span');
                dot.className = 'msg-author-dot';
                dot.setAttribute('aria-hidden', 'true');
                dot.style.background = accent;
                authorEl.prepend(dot);
            }
            const bodyEl = document.createElement('div');
            bodyEl.textContent = message.text;
            bubble.appendChild(authorEl);
            bubble.appendChild(bodyEl);
        }
        return bubble;
    }

    // Kept so the chat can be re-rendered when a peer is hidden mid-session.
    let chatHistoryCache = [];

    function isHiddenAuthor(message) {
        return !!(message && message.type !== 'system' && message.author && hiddenPeers.names.has(message.author));
    }

    function appendMessage(message) {
        if (!message) return;
        chatHistoryCache.push(message);
        if (isHiddenAuthor(message)) return;
        clearChatPlaceholder();
        chatMsgs.appendChild(buildMessageNode(message));
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }

    function renderMessages(list = []) {
        chatHistoryCache = Array.isArray(list) ? list.slice() : [];
        const visible = chatHistoryCache.filter(msg => !isHiddenAuthor(msg));
        chatMsgs.innerHTML = '';
        if (!visible.length) {
            showChatPlaceholder();
            return;
        }
        visible.forEach((msg) => {
            chatMsgs.appendChild(buildMessageNode(msg));
        });
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }

    function setChatEnabled(enabled) {
        chatInput.disabled = !enabled;
        chatSendBtn.disabled = !enabled;
        if (enabled) chatInput.focus();
    }

    function showJoinError(msg = '') {
        joinError.textContent = msg;
    }

    function handleJoinSubmit(e) {
        e.preventDefault();
        const name = joinNameInput.value.trim();
        const targetRoom = joinRoomInput.value.trim().toUpperCase();
        if (!name) {
            showJoinError(currentCopy().joinNameError);
            return;
        }
        if (!targetRoom) {
            showJoinError(currentCopy().roomCodeError);
            return;
        }
        showJoinError('');
        username = name;
        roomId = targetRoom;
        joinRoomInput.value = targetRoom;
        localStorage.setItem('halastudyName', username);
        updateRoomBadge();
        const baseUrl = window.location.origin + window.location.pathname;
        if (window.history?.replaceState) {
            history.replaceState(null, '', `${baseUrl}?room=${roomId}`);
        }
        joinOverlay.classList.add('hidden');
        setChatEnabled(false);
        setBoardEnabled(false);
        connectSocket();
    }

    function connectSocket() {
        if (!window.io) {
            showJoinError(currentCopy().serviceError);
            joinOverlay.classList.remove('hidden');
            return;
        }
        roomMembershipToken = '';
        if (isRealtimeKitRoom()) {
            void videoClient?.leave({ keepalive: true });
        }
        if (socket) socket.disconnect();
        setBoardEnabled(false);
        socket = io({ auth: { clientId: ensureClientId() } });
        const activeSocket = socket;
        let joinGeneration = 0;
        const joinActiveRoom = () => {
            const currentJoinGeneration = ++joinGeneration;
            roomMembershipToken = '';
            if (isRealtimeKitRoom()) {
                void videoClient?.leave({ keepalive: true });
            }
            activeSocket.emit('join-room', { roomId, username, clientId: ensureClientId(), password: getRoomPassword() }, (res = {}) => {
                if (socket !== activeSocket || currentJoinGeneration !== joinGeneration) return;
                if (!res.ok) {
                    roomMembershipToken = '';
                    setChatEnabled(false);
                    setBoardEnabled(false);
                    showJoinError(getErrorMessage(res.errorCode, 'joinFailed'));
                    joinOverlay.classList.remove('hidden');
                    return;
                }
                roomMembershipToken = typeof res.membershipToken === 'string'
                    ? res.membershipToken.trim()
                    : '';
                storeRoomPassword(getRoomPassword());
                clearStoredRoomCode();
                showJoinError('');
                applyJoinedRoom(res.room || {});
                setChatEnabled(true);
                setBoardState(res.room?.board || createEmptyBoardState());
                setBoardEnabled(true);
                renderMessages(res.room?.messages || []);
                updatePresenceList(res.room?.participants || []);
                broadcastStatus();
                if (isRealtimeKitRoom()) {
                    void mountRealtimeKitRoom(roomId, username);
                } else if (isSfuRoom()) {
                    mountSfuFrame(roomId, username);
                } else {
                    unmountSfuFrame();
                    unmountRealtimeKit();
                }
                if (isMeshRoom() && cameraEnabled && localStream) {
                    notifyCameraStatus(true);
                    participantsMap.forEach((_participant, id) => {
                        if (id !== socket.id && shouldInitiate(id)) createOffer(id);
                    });
                    updateMeshConnectionState();
                }
            });
        };
        activeSocket.on('connect', () => {
            if (socket !== activeSocket) return;
            if (isRealtimeKitRoom()) {
                setMediaState('mediaRealtimeKitLoading', { detailKey: 'mediaRealtimeKitDetail', showRetry: false });
            } else if (isMeshRoom()) {
                setMediaState('mediaMeshConnecting');
            } else if (isSfuRoom()) {
                setMediaState('mediaSfuLoading', { detailKey: 'aiSfuUnavailable', showRetry: false });
            }
            joinActiveRoom();
        });
        activeSocket.on('connect_error', () => {
            if (socket !== activeSocket) return;
            roomMembershipToken = '';
            if (isRealtimeKitRoom()) {
                void videoClient?.leave({ keepalive: true });
            }
            setChatEnabled(false);
            setBoardEnabled(false);
            showJoinError(currentCopy().connectError);
            joinOverlay.classList.remove('hidden');
        });
        activeSocket.on('chat-message', msg => appendMessage(msg));
        activeSocket.on('presence', list => updatePresenceList(list || []));
        activeSocket.on('board-state', (board) => {
            clearBoardFeedback();
            setBoardState(board, { preserveGoalDraft: isBoardGoalFocused() });
        });
        activeSocket.on('status-update', handleStatusUpdate);
        activeSocket.on('camera-status', handleCameraStatusEvent);
        activeSocket.on('announcement', (announcement) => {
            if (window.HalaCore) window.HalaCore.showAnnouncement(announcement);
        });
        activeSocket.on('announcement-clear', () => {
            if (window.HalaCore) window.HalaCore.clearAnnouncement();
        });
        activeSocket.on('kicked', () => {
            roomMembershipToken = '';
            void videoClient?.leave({ keepalive: true });
            if (window.HalaUI) window.HalaUI.toast(currentCopy().kickedMsg, { kind: 'error', duration: 6000 });
            setTimeout(() => window.location.assign('/'), 2500);
        });
        activeSocket.on('room-closed', () => {
            roomMembershipToken = '';
            void videoClient?.leave({ keepalive: true });
            if (window.HalaUI) window.HalaUI.toast(currentCopy().roomClosedMsg, { kind: 'error', duration: 6000 });
            setTimeout(() => window.location.assign('/'), 2500);
        });
        activeSocket.on('rtc-offer', handleIncomingOffer);
        activeSocket.on('rtc-answer', handleIncomingAnswer);
        activeSocket.on('rtc-ice', handleIncomingIce);
        activeSocket.on('disconnect', () => {
            if (socket !== activeSocket) return;
            roomMembershipToken = '';
            setChatEnabled(false);
            setBoardEnabled(false);
            appendMessage({ type: 'system', text: currentCopy().disconnectMsg });
            clearAllMeshMedia();
            if (isRealtimeKitRoom()) {
                void videoClient?.leave({ keepalive: true });
                setMediaState('mediaRealtimeKitUnavailable', { detailKey: 'videoProviderUnavailable', showRetry: true });
            } else if (isMeshRoom()) {
                setMediaState('mediaMeshReconnecting');
            } else if (isSfuRoom()) {
                setMediaState('mediaSfuUnavailable', { detailKey: 'aiSfuUnavailable', showRetry: true });
            }
        });
    }

    function sendMessage() {
        if (!socket || !roomId) {
            joinOverlay.classList.remove('hidden');
            showJoinError(currentCopy().roomNotJoined);
            return;
        }
        const text = chatInput.value.trim();
        if (!text) return;
        socket.emit('send-message', { roomId, text }, (ack = {}) => {
            if (ack.ok) {
                chatInput.value = '';
                return;
            }
            const errorText = getErrorMessage(ack.errorCode, 'messageRequired');
            if (ack.errorCode === 'ROOM_NOT_JOINED' || ack.errorCode === 'ROOM_NOT_FOUND') {
                showJoinError(errorText);
                joinOverlay.classList.remove('hidden');
            } else if (errorText) {
                appendMessage({ type: 'system', text: errorText });
            }
        });
    }

    chatForm.addEventListener('submit', e => { e.preventDefault(); sendMessage(); });
    (function initRoomPillCopy() {
        const pill = document.getElementById('room-pill');
        if (!pill) return;
        function copyRoomCode() {
            if (!roomId || !navigator.clipboard?.writeText) return;
            navigator.clipboard.writeText(roomId).then(() => {
                if (window.HalaUI) window.HalaUI.toast(langDict[curLang].codeCopied, { kind: 'success' });
            }).catch(() => {});
        }
        pill.addEventListener('click', copyRoomCode);
        pill.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                copyRoomCode();
            }
        });
    })();
    joinForm.addEventListener('submit', handleJoinSubmit);
    joinRoomInput.addEventListener('input', () => {
        joinRoomInput.value = joinRoomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    languageButtons.forEach((button) => {
        button.addEventListener('click', () => setLanguage(button.dataset.langValue));
    });
    if (roomGoalInput) {
        roomGoalInput.addEventListener('input', () => {
            roomGoalInput.value = roomGoalInput.value.slice(0, BOARD_GOAL_MAX_LENGTH);
            clearBoardFeedback();
        });
        roomGoalInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                roomGoalInput.blur();
            }
        });
        roomGoalInput.addEventListener('blur', () => commitBoardGoal());
    }
    if (newTaskInput) {
        newTaskInput.addEventListener('input', () => {
            newTaskInput.value = newTaskInput.value.slice(0, BOARD_TASK_MAX_LENGTH);
            clearBoardFeedback();
        });
        newTaskInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addBoardTask();
            }
        });
    }
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => addBoardTask());
    }
    if (priorityButtons?.length) {
        priorityButtons.forEach((button) => {
            button.addEventListener('click', () => setBoardPriority(button.dataset.priority));
        });
    }
    if (statusPresetButtons?.length) {
        statusPresetButtons.forEach(btn => {
            btn.addEventListener('click', () => setStatusPreset(btn.dataset.status));
        });
    }
    if (statusCustomInput) {
        statusCustomInput.addEventListener('input', () => {
            const value = statusCustomInput.value.slice(0, 20);
            statusCustomInput.value = value;
            statusState.manualText = value;
            statusState.manualPreset = null;
            updateStatusPresetUI(null);
            refreshStatusState();
        });
    }
    (function initTimerPresets() {
        const presetsEl = document.getElementById('timer-presets');
        if (presetsEl) {
            presetsEl.addEventListener('click', event => {
                const chip = event.target.closest('.timer-preset-chip');
                if (!chip) return;
                applyTimerPreset(parseInt(chip.dataset.focus, 10) || 25, parseInt(chip.dataset.break, 10) || 5);
            });
        }
        ['cfg-f', 'cfg-b'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.addEventListener('input', updatePresetActiveState);
        });
        updatePresetActiveState();
    })();
    if (statusGoalInput) {
        statusGoalInput.addEventListener('input', () => {
            const value = statusGoalInput.value.slice(0, 80);
            statusGoalInput.value = value;
            statusState.goal = value;
            refreshStatusState();
        });
    }
    if (statusAutoSyncToggle) {
        statusAutoSyncToggle.addEventListener('change', () => {
            statusState.autoSync = statusAutoSyncToggle.checked;
            refreshStatusState();
        });
    }
    if (statusShareToggle) {
        statusShareToggle.addEventListener('change', () => {
            statusState.isShared = statusShareToggle.checked;
            refreshStatusState();
        });
    }
    if (ambientToggleBtn) {
        ambientToggleBtn.addEventListener('click', () => toggleAmbientPopover());
    }
    if (ambientListEl) {
        ambientListEl.addEventListener('click', event => {
            const target = event.target.closest('li');
            if (!target) return;
            selectAmbientSound(target.dataset.sound);
        });
    }
    if (ambientVolumeInput) {
        ambientVolumeInput.addEventListener('input', () => {
            const value = parseFloat(ambientVolumeInput.value);
            if (!Number.isNaN(value)) {
                ambientSoundState.volume = value;
                if (ambientSoundState.audio) ambientSoundState.audio.volume = value;
                saveAmbientState();
            }
        });
    }
    if (ambientStatusShareToggle) {
        ambientStatusShareToggle.addEventListener('change', () => {
            ambientSoundState.showInStatus = ambientStatusShareToggle.checked;
            saveAmbientState();
            refreshStatusState();
        });
    }
    document.addEventListener('click', handleAmbientOutsideClick);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') toggleAmbientPopover(false);
    });
    if (focusResetBtn) {
        focusResetBtn.addEventListener('click', () => resetFocusStats());
    }
    if (scheduleCalendarBtn) {
        scheduleCalendarBtn.addEventListener('click', () => downloadScheduleCalendar());
    }
    if (cameraToggleBtn) {
        cameraToggleBtn.addEventListener('click', e => {
            e.preventDefault();
            toggleCamera();
        });
    }
    (function initBlurToggle() {
        const blurBtn = document.getElementById('blur-toggle');
        if (!blurBtn) return;
        blurBtn.addEventListener('click', e => {
            e.preventDefault();
            void toggleBlur();
        });
    })();
    if (mediaRetryBtn) {
        mediaRetryBtn.addEventListener('click', () => {
            if (isRealtimeKitRoom() && roomId) {
                void mountRealtimeKitRoom(roomId, username);
            } else if (isSfuRoom() && roomId) {
                mountSfuFrame(roomId, username);
            }
        });
    }
    window.addEventListener('pagehide', () => {
        if (isRealtimeKitRoom()) {
            roomMembershipToken = '';
            void videoClient?.leave({ keepalive: true });
        }
    });

    function updateCameraToggleLabel(state) {
        if (!cameraToggleBtn) return;
        updateBlurToggleLabel();
        if (state === 'loading') {
            cameraToggleBtn.disabled = true;
            cameraToggleBtn.textContent = langDict[curLang].cameraToggleStarting;
            return;
        }
        if (isRealtimeKitRoom()) {
            cameraToggleBtn.disabled = true;
            cameraToggleBtn.textContent = langDict[curLang].mediaModeRealtimeKitBadge;
            return;
        }
        if (isSfuRoom()) {
            cameraToggleBtn.disabled = true;
            cameraToggleBtn.textContent = langDict[curLang].mediaModeSfuBadge;
            return;
        }
        cameraToggleBtn.disabled = false;
        cameraToggleBtn.textContent = cameraEnabled ? langDict[curLang].cameraToggleOff : langDict[curLang].cameraToggleOn;
    }

    async function mountSfuFrame(roomCode, displayName) {
        await ensureRtcConfigurationReady();
        if (!isSfuRoom()) {
            unmountSfuFrame();
            return;
        }
        if (!sfuBaseUrl || !sfuFrame || !videoBox) {
            setMediaState('mediaSfuUnavailable', { detailKey: 'aiSfuUnavailable', showRetry: true });
            return;
        }
        clearSfuFrameLoadTimer();
        sfuFrameLoaded = false;
        videoBox.classList.add('sfu-mode');
        setMediaState('mediaSfuLoading', { detailKey: 'aiSfuUnavailable', showRetry: false });
        const params = new URLSearchParams({
            room: roomCode,
            name: displayName || '',
            audio: 'false',
            video: 'true',
            screen: 'false',
            chat: 'false',
            hide: 'false',
            notify: 'false'
        });
        sfuFrame.onload = () => {
            sfuFrameLoaded = true;
            clearSfuFrameLoadTimer();
            setMediaState('mediaSfuManaged', { detailKey: 'aiSfuUnavailable', showRetry: false });
        };
        sfuFrame.onerror = () => {
            sfuFrameLoaded = false;
            clearSfuFrameLoadTimer();
            setMediaState('mediaSfuUnavailable', { detailKey: 'aiSfuUnavailable', showRetry: true });
        };
        sfuFrame.src = `${sfuBaseUrl}/join?${params.toString()}`;
        sfuFrameLoadTimer = setTimeout(() => {
            if (!sfuFrameLoaded) {
                setMediaState('mediaSfuUnavailable', { detailKey: 'aiSfuUnavailable', showRetry: true });
            }
        }, SFU_LOAD_TIMEOUT_MS);
    }

    async function toggleCamera() {
        if (!isMeshRoom()) return;
        if (!navigator.mediaDevices?.getUserMedia) {
            alert(langDict[curLang].cameraError);
            return;
        }
        if (cameraEnabled) {
            disableCamera();
            return;
        }
        updateCameraToggleLabel('loading');
        try {
            debugLog('CAMERA', 'Requesting camera access...');
            rawStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
                audio: false
            });
            rawStream.getVideoTracks().forEach(track => {
                track.onended = () => disableCamera();
            });
            if (blurEnabled && supportsCanvasFilter) {
                try {
                    localStream = await startBlurPipeline(rawStream);
                } catch (blurErr) {
                    debugLog('ERROR', 'Blur pipeline failed, sending raw', blurErr.message);
                    stopBlurPipeline({ keepRaw: true });
                    localStream = rawStream;
                }
            } else {
                localStream = rawStream;
            }
            cameraEnabled = true;
            debugLog('CAMERA', 'Camera enabled', {
                streamId: localStream.id,
                tracks: localStream.getTracks().length,
                blurred: localStream !== rawStream
            });
            localVideo.srcObject = localStream;
            localVideo.style.display = 'block';
            updateRemotePlaceholder();
            updateCameraToggleLabel();
            notifyCameraStatus(true);
            debugLog('CAMERA', `Attaching local stream to ${peerConnections.size} peer(s)`);
            for (const [peerId, pc] of peerConnections.entries()) {
                debugLog('CAMERA', `Attaching to peer ${peerId}`);
                const attached = await attachLocalStream(pc);
                if (attached) {
                    debugLog('CAMERA', `Successfully attached stream to ${peerId}, negotiation will be triggered`);
                }
            }
            startAiMonitor();
        } catch (err) {
            console.error('camera error', err);
            debugLog('ERROR', 'Camera access failed', err.message);
            cameraEnabled = false;
            updateCameraToggleLabel();
            aiStatusEl.textContent = langDict[curLang].cameraError;
            alert(langDict[curLang].cameraError);
        }
    }

    function notifyCameraStatus(flag) {
        if (socket && isMeshRoom()) socket.emit('camera-status', { camera: !!flag });
    }

    function shouldInitiate(targetId) {
        if (!socket?.id) return true;
        const remoteId = typeof targetId === 'string' ? targetId : (targetId ? String(targetId) : '');
        if (!remoteId) return true;
        return socket.id < remoteId;
    }

    function isPolitePeer(targetId) {
        if (!socket?.id) return true;
        const remoteId = typeof targetId === 'string' ? targetId : (targetId ? String(targetId) : '');
        if (!remoteId) return true;
        return socket.id > remoteId;
    }

    function ensurePeerConnection(targetId) {
        if (!isMeshRoom()) {
            return null;
        }
        if (peerConnections.has(targetId)) {
            debugLog('PEER', `Reusing existing connection for ${targetId}`);
            return peerConnections.get(targetId);
        }

        debugLog('PEER', `Creating new PeerConnection for ${targetId}`);
        const pc = new RTCPeerConnection(rtcConfiguration);
        const meta = {
            makingOffer: false,
            ignoreOffer: false,
            isSettingRemoteAnswerPending: false,
            polite: isPolitePeer(targetId),
        };
        pc.__meta = meta;

        pc.onicecandidate = event => {
            if (event.candidate) {
                debugLog('ICE', `Local ICE candidate for ${targetId}`, event.candidate.candidate);
                if (socket) socket.emit('rtc-ice', { targetId, candidate: event.candidate });
            } else {
                debugLog('ICE', `ICE gathering complete for ${targetId}`);
            }
        };

        pc.ontrack = event => {
            debugLog('TRACK', `Received remote track from ${targetId}`, {
                kind: event.track.kind,
                streams: event.streams.length,
                enabled: event.track.enabled,
                readyState: event.track.readyState
            });
            if (event.streams?.[0]) {
                handleRemoteStream(targetId, event.streams[0]);
            }
        };

        pc.onconnectionstatechange = () => {
            debugLog('STATE', `Connection state for ${targetId}: ${pc.connectionState}`);
            if (['failed', 'disconnected'].includes(pc.connectionState)) {
                clearRemoteStream(targetId);
            }
            updateMeshConnectionState();
        };

        pc.oniceconnectionstatechange = () => {
            debugLog('ICE-STATE', `ICE connection state for ${targetId}: ${pc.iceConnectionState}`);
            updateMeshConnectionState();
        };

        pc.onicegatheringstatechange = () => {
            debugLog('ICE-GATHER', `ICE gathering state for ${targetId}: ${pc.iceGatheringState}`);
        };

        pc.onsignalingstatechange = () => {
            debugLog('SIGNAL', `Signaling state for ${targetId}: ${pc.signalingState}`);
        };

        pc.onnegotiationneeded = async () => {
            debugLog('NEGOTIATE', `Negotiation needed for ${targetId}`);
            if (meta.makingOffer || pc.signalingState !== 'stable') {
                debugLog('NEGOTIATE', `Skipping negotiation for ${targetId} (already in progress or not stable)`);
                return;
            }
            try {
                meta.makingOffer = true;
                const offer = await pc.createOffer();
                if (pc.signalingState !== 'stable') {
                    debugLog('NEGOTIATE', `Signaling state changed during offer creation for ${targetId}, aborting`);
                    meta.makingOffer = false;
                    return;
                }
                await pc.setLocalDescription(offer);
                debugLog('OFFER', `Created and set local offer for ${targetId}`);
                socket.emit('rtc-offer', { targetId, sdp: pc.localDescription });
            } catch (err) {
                console.error('negotiation error', err);
                debugLog('ERROR', `Negotiation failed for ${targetId}`, err.message);
            } finally {
                meta.makingOffer = false;
            }
        };

        peerConnections.set(targetId, pc);
        debugLog('PEER', `PeerConnection created and stored for ${targetId}`);

        attachLocalStream(pc).then(attached => {
            if (attached) {
                debugLog('PEER', `Local stream attached during connection creation for ${targetId}`);
            } else if (!localStream) {
                ensureRecvPlaceholder(pc, meta, targetId);
            }
        });

        return pc;
    }

    async function attachLocalStream(pc) {
        if (!localStream) {
            debugLog('STREAM', 'No local stream to attach');
            return false;
        }
        const track = localStream.getVideoTracks()[0];
        if (!track) {
            debugLog('STREAM', 'No video track in local stream');
            return false;
        }

        debugLog('STREAM', 'Attaching local track', {
            trackId: track.id,
            enabled: track.enabled,
            readyState: track.readyState,
            muted: track.muted
        });

        const meta = pc.__meta || {};
        if (meta.recvonlyVideoTransceiver?.sender) {
            debugLog('STREAM', 'Upgrading placeholder transceiver to sendrecv');
            try {
                await meta.recvonlyVideoTransceiver.sender.replaceTrack(track);
                meta.recvonlyVideoTransceiver.direction = 'sendrecv';
                meta.recvonlyVideoTransceiver = null;
                return true;
            } catch (err) {
                debugLog('ERROR', 'Failed to upgrade transceiver', err.message);
            }
        }

        const existingSender = pc.getSenders().find(sender => sender.track && sender.track.kind === 'video');
        if (existingSender) {
            if (existingSender.track !== track) {
                debugLog('STREAM', 'Replacing existing video track');
                await existingSender.replaceTrack(track);
                return true;
            } else {
                debugLog('STREAM', 'Track already attached, skipping');
                return false;
            }
        } else {
            debugLog('STREAM', 'Adding new video track to peer connection');
            pc.addTrack(track, localStream);
            return true;
        }
    }

    function ensureRecvPlaceholder(pc, meta, targetId) {
        if (!pc || typeof pc.addTransceiver !== 'function') return;
        const hasActiveSender = pc.getSenders().some(sender => sender.track && sender.track.kind === 'video');
        if (hasActiveSender || meta.recvonlyVideoTransceiver) return;
        try {
            meta.recvonlyVideoTransceiver = pc.addTransceiver('video', { direction: 'recvonly' });
            debugLog('PEER', `Added recvonly video transceiver for ${targetId}`);
        } catch (err) {
            debugLog('ERROR', `Failed to allocate recvonly transceiver for ${targetId}`, err.message);
        }
    }

    function queuePendingIceCandidate(peerId, candidate) {
        if (!pendingIceCandidates.has(peerId)) {
            pendingIceCandidates.set(peerId, []);
        }
        pendingIceCandidates.get(peerId).push(candidate);
        debugLog('ICE-QUEUE', `Queued ICE candidate for ${peerId}, total: ${pendingIceCandidates.get(peerId).length}`);
    }

    async function addIceCandidateSafe(pc, candidate) {
        try {
            await pc.addIceCandidate(candidate);
            debugLog('ICE', 'Successfully added ICE candidate');
        } catch (err) {
            console.error('Failed to add ICE candidate:', err);
            debugLog('ERROR', 'Failed to add ICE candidate', err.message);
        }
    }

    async function flushPendingIceCandidates(peerId, pc) {
        const pending = pendingIceCandidates.get(peerId);
        if (!pending?.length) {
            debugLog('ICE-FLUSH', `No pending candidates for ${peerId}`);
            return;
        }

        debugLog('ICE-FLUSH', `Flushing ${pending.length} candidates for ${peerId}`);
        pendingIceCandidates.delete(peerId);
        for (const iceCandidate of pending) {
            await addIceCandidateSafe(pc, iceCandidate);
        }
        debugLog('ICE-FLUSH', `Completed flushing candidates for ${peerId}`);
    }

    async function createOffer(targetId) {
        if (!isMeshRoom()) return;
        await ensureRtcConfigurationReady();
        const pc = ensurePeerConnection(targetId);
        if (!pc) return;
        const meta = pc.__meta || {};
        if (meta.makingOffer || pc.signalingState !== 'stable') {
            debugLog('OFFER', `Skipping manual offer for ${targetId} (already in progress or not stable)`);
            return;
        }
        try {
            meta.makingOffer = true;
            const offer = await pc.createOffer();
            if (pc.signalingState !== 'stable') {
                debugLog('OFFER', `Signaling state changed during manual offer creation for ${targetId}, aborting`);
                meta.makingOffer = false;
                return;
            }
            await pc.setLocalDescription(offer);
            socket.emit('rtc-offer', { targetId, sdp: pc.localDescription });
        } catch (err) {
            console.error('offer error', err);
        } finally {
            meta.makingOffer = false;
        }
    }

    async function handleIncomingOffer({ from, sdp }) {
        if (!isMeshRoom()) return;
        debugLog('OFFER', `Received offer from ${from}`);
        await ensureRtcConfigurationReady();
        const pc = ensurePeerConnection(from);
        const meta = pc.__meta || { polite: true };
        const offer = new RTCSessionDescription(sdp);
        const offerCollision = meta.makingOffer || pc.signalingState !== 'stable';
        meta.ignoreOffer = !meta.polite && offerCollision;

        if (meta.ignoreOffer) {
            debugLog('OFFER', `Ignoring offer from ${from} due to collision`);
            return;
        }

        try {
            if (offerCollision) {
                debugLog('OFFER', `Collision detected, rolling back for ${from}`);
                try {
                    await pc.setLocalDescription({ type: 'rollback' });
                } catch (rollbackErr) {
                    console.warn('rollback failed', rollbackErr);
                }
            }
            await pc.setRemoteDescription(offer);
            debugLog('OFFER', `Set remote description (offer) for ${from}`);
            meta.ignoreOffer = false;
            await flushPendingIceCandidates(from, pc);
            attachLocalStream(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            debugLog('ANSWER', `Created and set local answer for ${from}`);
            socket.emit('rtc-answer', { targetId: from, sdp: pc.localDescription });
        } catch (err) {
            console.error('answer error', err);
            debugLog('ERROR', `Failed to handle offer from ${from}`, err.message);
        }
    }

    async function handleIncomingAnswer({ from, sdp }) {
        if (!isMeshRoom()) return;
        debugLog('ANSWER', `Received answer from ${from}`);
        await ensureRtcConfigurationReady();
        const pc = ensurePeerConnection(from);
        if (!pc) {
            debugLog('ERROR', `No peer connection found for ${from}`);
            return;
        }
        const meta = pc.__meta || {};
        try {
            meta.isSettingRemoteAnswerPending = true;
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            debugLog('ANSWER', `Set remote description (answer) for ${from}`);
            await flushPendingIceCandidates(from, pc);
            attachLocalStream(pc);
        } catch (err) {
            console.error('set answer error', err);
            debugLog('ERROR', `Failed to handle answer from ${from}`, err.message);
        } finally {
            meta.isSettingRemoteAnswerPending = false;
            meta.ignoreOffer = false;
        }
    }

    async function handleIncomingIce({ from, candidate }) {
        if (!isMeshRoom()) return;
        await ensureRtcConfigurationReady();
        const pc = ensurePeerConnection(from);
        if (!candidate || !pc) {
            debugLog('ICE', 'Ignoring ICE: no candidate or no peer connection');
            return;
        }
        if (pc.__meta?.ignoreOffer) {
            debugLog('ICE', `Ignoring ICE from ${from} (ignoreOffer=true)`);
            return;
        }

        const iceCandidate = new RTCIceCandidate(candidate);
        debugLog('ICE', `Received ICE candidate from ${from}`, candidate.candidate);

        if (!pc.remoteDescription?.type) {
            debugLog('ICE', `Remote description not ready, queuing candidate for ${from}`);
            queuePendingIceCandidate(from, iceCandidate);
            return;
        }

        debugLog('ICE', `Adding ICE candidate immediately for ${from}`);
        await addIceCandidateSafe(pc, iceCandidate);
    }

    function ensureRemoteVideoSlot(userId) {
        if (!remoteGrid) {
            debugLog('ERROR', 'Remote grid element not found');
            return null;
        }
        if (remoteVideoSlots.has(userId)) {
            debugLog('VIDEO-SLOT', `Reusing existing video slot for ${userId}`);
            return remoteVideoSlots.get(userId);
        }

        debugLog('VIDEO-SLOT', `Creating new video slot for ${userId}`);
        const tile = document.createElement('div');
        tile.className = 'remote-tile';
        if (hiddenPeers.ids.has(userId)) tile.classList.add('is-hidden');
        tile.dataset.peerId = userId;

        const videoEl = document.createElement('video');
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.muted = false;
        videoEl.dataset.peerId = userId;

        const nameEl = document.createElement('div');
        nameEl.className = 'remote-tile-name';
        nameEl.textContent = getRemoteDisplayName(userId);

        tile.appendChild(videoEl);
        tile.appendChild(nameEl);
        remoteGrid.appendChild(tile);

        const slot = { tile, videoEl, nameEl };
        remoteVideoSlots.set(userId, slot);
        debugLog('VIDEO-SLOT', `Video slot created for ${userId}, total slots: ${remoteVideoSlots.size}`);
        updateRemoteNameLabel();
        updateRemotePlaceholder();
        return slot;
    }

    function removeRemoteVideoSlot(userId) {
        const slot = remoteVideoSlots.get(userId);
        if (!slot) {
            debugLog('VIDEO-SLOT', `No video slot found for ${userId}`);
            return;
        }
        debugLog('VIDEO-SLOT', `Removing video slot for ${userId}`);
        if (slot.videoEl.srcObject) {
            slot.videoEl.srcObject.getTracks().forEach((track) => {
                track.stop();
            });
            slot.videoEl.srcObject = null;
        }
        slot.tile.remove();
        remoteVideoSlots.delete(userId);
        debugLog('VIDEO-SLOT', `Video slot removed for ${userId}, remaining slots: ${remoteVideoSlots.size}`);
        updateRemoteNameLabel();
        updateRemotePlaceholder();
    }

    function handleRemoteStream(userId, stream) {
        debugLog('STREAM', `Handling remote stream from ${userId}`, {
            streamId: stream.id,
            tracks: stream.getTracks().length,
            videoTracks: stream.getVideoTracks().length
        });

        const slot = ensureRemoteVideoSlot(userId);
        if (!slot) {
            debugLog('ERROR', `Failed to create/get video slot for ${userId}`);
            return;
        }
        slot.nameEl.textContent = getRemoteDisplayName(userId);

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            debugLog('STREAM', `Remote video track details for ${userId}:`, {
                id: videoTrack.id,
                enabled: videoTrack.enabled,
                muted: videoTrack.muted,
                readyState: videoTrack.readyState,
                label: videoTrack.label
            });

            videoTrack.onmute = () => {
                debugLog('STREAM', `Remote video track MUTED for ${userId}`);
            };
            videoTrack.onunmute = () => {
                debugLog('STREAM', `Remote video track UNMUTED for ${userId}`);
            };
            videoTrack.onended = () => {
                debugLog('STREAM', `Remote video track ENDED for ${userId}`);
                clearRemoteStream(userId);
            };
        } else {
            debugLog('ERROR', `No video track in remote stream from ${userId}`);
        }

        if (slot.videoEl.srcObject !== stream) {
            slot.videoEl.srcObject = stream;
            debugLog('STREAM', `Set remote video srcObject for ${userId}`);

            slot.videoEl.play().then(() => {
                debugLog('STREAM', `Remote video playing for ${userId}`);
            }).catch(err => {
                debugLog('ERROR', `Failed to play remote video for ${userId}`, err.message);
            });
        }
        slot.videoEl.style.display = 'block';
        if (remoteStatusEl) remoteStatusEl.textContent = '';
        updateRemotePlaceholder();
        updateRemoteNameLabel();
        updateMeshConnectionState();

        slot.videoEl.onloadedmetadata = () => {
            debugLog('STREAM', `Remote video metadata loaded for ${userId}`, {
                videoWidth: slot.videoEl.videoWidth,
                videoHeight: slot.videoEl.videoHeight,
                videoElement_muted: slot.videoEl.muted,
                videoElement_volume: slot.videoEl.volume
            });

            if (slot.videoEl.videoWidth === 0 || slot.videoEl.videoHeight === 0) {
                debugLog('ERROR', `Video dimensions are 0x0 for ${userId}, waiting for actual video data`);
            }
        };

        slot.videoEl.onplay = () => {
            debugLog('STREAM', `Remote video started playing for ${userId}`);
        };

        slot.videoEl.oncanplay = () => {
            debugLog('STREAM', `Remote video can play for ${userId}`, {
                width: slot.videoEl.videoWidth,
                height: slot.videoEl.videoHeight
            });
        };

        slot.videoEl.onplaying = () => {
            debugLog('STREAM', `Remote video is actively playing for ${userId}`);
        };
    }

    function clearRemoteStream(userId) {
        if (userId) {
            debugLog('STREAM', `Clearing remote stream for specific user: ${userId}`);
            removeRemoteVideoSlot(userId);
        } else {
            debugLog('STREAM', 'Clearing all remote streams');
            [...remoteVideoSlots.keys()].forEach((id) => {
                removeRemoteVideoSlot(id);
            });
        }
        updateRemotePlaceholder();
        updateRemoteNameLabel();
        if (remoteStatusEl) {
            const hasRemoteBuddy = hasRemoteBuddyOnline();
            remoteStatusEl.textContent = remoteVideoSlots.size || !hasRemoteBuddy ? '' : langDict[curLang].remoteOffline;
        }
        updateMeshConnectionState();
    }

    function handleCameraStatusEvent(payload = {}) {
        if (!isMeshRoom()) return;
        const { userId, camera } = payload;
        if (socket && userId === socket.id) return;
        remoteCameraStates.set(userId, !!camera);
        debugLog('CAMERA-STATUS', `User ${userId} camera status: ${camera}`);
        if (!camera) {
            clearRemoteStream(userId);
        } else if (remoteStatusEl) {
            remoteStatusEl.textContent = '';
        }
        if (!remoteVideoSlots.size && remoteStatusEl) {
            const hasRemoteBuddy = hasRemoteBuddyOnline();
            remoteStatusEl.textContent = hasRemoteBuddy ? langDict[curLang].remoteOffline : '';
        }
    }

    function initAiDetector() {
        if (isSfuRoom()) {
            aiDetector = null;
            aiStatusEl.textContent = langDict[curLang].aiSfuUnavailable;
            setAiDotState('neutral');
            return false;
        }
        if (!('FaceDetector' in window)) {
            aiDetector = null;
            aiStatusEl.textContent = langDict[curLang].aiUnsupported;
            setAiDotState('neutral');
            return false;
        }
        if (!aiDetector) {
            try {
                aiDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
            } catch (_err) {
                aiDetector = null;
                aiStatusEl.textContent = langDict[curLang].aiUnsupported;
                setAiDotState('neutral');
                return false;
            }
        }
        return true;
    }

    function startAiMonitor() {
        if (!isMeshRoom()) return;
        if (!initAiDetector()) return;
        if (aiMonitorTimer) return;
        aiMonitorTimer = setInterval(runAiScan, 4000);
        aiStatusEl.textContent = langDict[curLang].aiReady;
        setAiDotState();
    }

    function stopAiMonitor() {
        if (aiMonitorTimer) {
            clearInterval(aiMonitorTimer);
            aiMonitorTimer = null;
        }
        setAiDotState('neutral');
    }

    async function runAiScan() {
        if (!isMeshRoom()) {
            aiStatusEl.textContent = langDict[curLang].aiSfuUnavailable;
            setAiDotState('neutral');
            return;
        }
        if (!cameraEnabled || !localVideo.videoWidth) {
            aiStatusEl.textContent = langDict[curLang].aiNeedCamera;
            setAiDotState('neutral');
            return;
        }
        try {
            // With blur on, localVideo shows the blurred canvas — faces would
            // never be detected. Read the hidden raw video instead.
            const detectSource = (blurPipeline.running && blurPipeline.rawVideo?.videoWidth)
                ? blurPipeline.rawVideo
                : localVideo;
            const faces = await aiDetector.detect(detectSource);
            if (faces.length) {
                aiStatusEl.textContent = langDict[curLang].aiFocused;
                setAiDotState();
            } else {
                aiStatusEl.textContent = langDict[curLang].aiAway;
                setAiDotState('warn');
            }
        } catch (_err) {
            aiStatusEl.textContent = langDict[curLang].aiUnsupported;
            setAiDotState('neutral');
            stopAiMonitor();
        }
    }

    function setAiDotState(state) {
        aiDot.classList.remove('warn', 'neutral');
        if (state === 'warn') aiDot.classList.add('warn');
        else if (state === 'neutral') aiDot.classList.add('neutral');
    }

    function shareRoom() {
        const target = roomId || (joinRoomInput.value.trim().toUpperCase() || generateRoomCode());
        const link = `${window.location.origin}${window.location.pathname}?room=${target}`;
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(link).then(() => {
                if (window.HalaUI) window.HalaUI.toast(langDict[curLang].shareSuccess, { kind: 'success' });
                else alert(langDict[curLang].shareSuccess);
            }).catch(() => {
                window.prompt(langDict[curLang].shareFallback, link);
            });
        } else {
            window.prompt(langDict[curLang].shareFallback, link);
        }
    }

    document.getElementById('theme-toggle')?.addEventListener('click', toggleDark);
    document.getElementById('share-room-btn')?.addEventListener('click', shareRoom);
    document.getElementById('btn-reset-timer')?.addEventListener('click', resetTimer);
    document.getElementById('btn-toggle')?.addEventListener('click', toggleTimer);

    (function initShell(){
        rtcConfigurationPromise = loadRtcConfiguration();
        const params = new URLSearchParams(window.location.search);
        let incomingRoom = (params.get('room') || '').trim().toUpperCase();
        if (!incomingRoom) {
            incomingRoom = getStoredRoomCode().toUpperCase();
        }
        if (incomingRoom) {
            roomId = incomingRoom;
            joinRoomInput.value = incomingRoom;
        } else {
            joinRoomInput.value = generateRoomCode();
        }
        const savedName = localStorage.getItem('halastudyName') || '';
        if (savedName) joinNameInput.value = savedName;
        showChatPlaceholder();
        updateDisp();
        applyRoomMediaMode(MEDIA_MODE_MESH, { participantLimit: getMeshParticipantLimit() });
        updateRemotePlaceholder();
        initAiDetector();
        updateCameraToggleLabel();
        aiStatusEl.textContent = langDict[curLang].aiNeedCamera;
        loadStatusState();
        loadAmbientState();
        loadFocusStats();
        initAccountIntegration();
        setBoardState(createEmptyBoardState());
        setBoardPriority(3);
        renderScheduleCard();
        applyLanguage();
        updatePresenceList([]);
        setChatEnabled(false);
        setBoardEnabled(false);

        if (savedName && incomingRoom) {
            username = savedName;
            roomId = incomingRoom;
            updateRoomBadge();
            joinOverlay.classList.add('hidden');
            connectSocket();
        }
    })();
