(() => {
    const global = /** @type {any} */ (window);
    const core = global.HalaCore;
    const $ = (id) => /** @type {any} */ (document.getElementById(id));
    const ar = {};
    document.querySelectorAll('[data-lang]').forEach((element) => {
        ar[element.getAttribute('data-lang')] = element.textContent;
    });
    Object.assign(ar, {
        unresolvedPayments: 'مدفوعات تجريبية تحتاج إلى مراجعة',
        paymentReviewHelp: 'التحقق لا ينشئ خصمًا جديدًا. المحاولات بلا مرجع دفع تحتاج إلى مراجعة لدى المزوّد.',
        recheckPayment: 'إعادة التحقق من الدفع', activateReviewedPayment: 'تفعيل دفعة موثّقة بعد المراجعة',
        transactionHint: 'مرجع العملية لدى المزوّد (اختياري)', olderOrders: 'عرض المحاولات الأقدم',
        PAYMENT_AWAITING_NOTIFICATION: 'مرجع العملية غير متاح. راجع محاولة الدفع لدى المزوّد.',
        PAYMENT_MISMATCH: 'بيانات المزوّد لا تطابق محاولة الدفع. لم تتغير العضوية.',
        pending: 'قيد الانتظار', unknown: 'غير مؤكدة', review: 'تحتاج إلى مراجعة', creating: 'قيد الإنشاء', refunded: 'مستردّة', expired: 'منتهية',
        alertsTitle: 'تنبيهات التشغيل الأخيرة', alertsEmpty: 'لا توجد تنبيهات مسجّلة.',
        alertLocal: 'التنبيهات محفوظة محليًا. الإشعارات الخارجية غير مفعّلة.',
        alertExternal: 'الإشعارات الخارجية مفعّلة.', alertStorage: 'تعذر حفظ سجل التنبيهات.',
        account_rollback_persist_failed: 'تعذر استعادة بيانات الحساب', video_revocation_failed: 'تعذر إلغاء وصول الفيديو',
        video_revocation_persist_failed: 'تعذر حفظ إلغاء الوصول', video_revocation_start_failed: 'تعذر فتح سجل وصول الفيديو',
        database_lease_lost: 'فقد الخادم حجز قاعدة البيانات', database_connection_failed: 'انقطاع اتصال قاعدة البيانات',
        storage_shutdown_failed: 'تعذر حفظ البيانات عند إيقاف الخادم', backup_failed: 'فشل النسخ الاحتياطي', backup_stale: 'تأخر النسخ الاحتياطي',
        authentication_rejected: 'ارتفاع محاولات الدخول المرفوضة', socket_handler_failed: 'أخطاء في اتصالات الغرف',
        attendance_sweep_failed: 'تعذر تحديث الحضور', account_recovery_delivery_failed: 'تعذر تجهيز رسالة الاستعادة',
        video_provider_request_failed: 'أخطاء لدى مزود الفيديو',
        pageTitle: 'مساحتك — Halastudy', workspaceNav: 'التنقل في المساحة', greeting: 'أهلًا،',
        minutes: 'دقائق موثّقة', sessions: 'جلسات مكتملة', xp: 'نقاط التركيز', streak: 'أيام متتالية',
        emptyRooms: 'غرفك الجديدة ستظهر هنا. الغرف القديمة تبقى في سجل حسابك.',
        emptySessions: 'جلستك الأولى بداية جميلة. ابدأ عندما تكون جاهزًا.',
        emptyCircles: 'مجموعاتك ستظهر هنا بعد إنشاء مجموعة أو قبول دعوة.',
        emptyAchievements: 'إنجازك الأول ينتظرك بعد دقيقة تركيز مكتملة.',
        first_session: 'أول جلسة', focus_100: '100 دقيقة تركيز', focus_1000: '1000 دقيقة تركيز',
        active: 'جارٍ التركيز', paused: 'متوقفة مؤقتًا', completed: 'مكتملة', abandoned: 'غير مكتملة',
        noSession: 'جاهز عندما تكون جاهزًا', resume: 'استئناف', rename: 'تعديل الاسم', save: 'حفظ',
        join: 'ادخل الغرفة', view: 'عرض', supervisor: 'مشرف المجموعة', member: 'عضو', owner: 'مالك المجموعة',
        makeSupervisor: 'تعيين مشرف', makeMember: 'إعادة إلى عضو', remove: 'إزالة', attendance: 'الحضور',
        on_time: 'في الموعد', late: 'متأخر', absent: 'لم يسجّل حضورًا', noData: 'لا توجد بيانات بعد.',
        subscriptionActive: 'عضوية VIP التجريبية مفعّلة حتى', subscriptionCancels: 'تنتهي العضوية في',
        keepMembership: 'الإبقاء على العضوية', signInForVip: 'سجّل الدخول لتجربة VIP',
        checkoutUnavailable: 'الدفع غير متاح حتى إعداد مزوّد الدفع.',
        checkoutDeclined: 'تمت محاكاة رفض الدفع. لم تتغير عضويتك.',
        checkoutCanceled: 'أُلغيت تجربة الدفع.', checkoutSuccess: 'تم تفعيل VIP التجريبي. لم يُخصم أي مبلغ.',
        saved: 'تم الحفظ.', inviteReady: 'رمز دعوة لشخص واحد، صالح لمدة 48 ساعة:',
        mfaReady: 'تم التحقق. أدوات الموظفين متاحة لمدة 15 دقيقة.',
        revoke: 'سحب الصلاحية', staffCount: 'حسابات', roomCount: 'غرف', participants: 'حاضرون',
        disposition: 'سبب القرار', resolve: 'إغلاق البلاغ', dismiss: 'رفض البلاغ', investigating: 'قيد المراجعة',
        resolved: 'مغلق', dismissed: 'مرفوض', open: 'مفتوح', confirmRemove: 'تأكيد الإزالة',
        roleModerator: 'مشرف محتوى', roleSupport: 'الدعم', roleBilling: 'الفوترة',
        roleAdmin: 'مسؤول المنصة', roleSuperAdmin: 'مسؤول رئيسي', securitySaved: 'احفظ رموز الاسترداد الآن.',
        genericError: 'تعذّر إكمال الطلب. حاول مرة أخرى.', networkError: 'انقطع الاتصال. الدقائق أثناء الانقطاع لا تُحتسب.',
        AUTH_REQUIRED: 'سجّل الدخول لإكمال الطلب.', FORBIDDEN: 'هذا الإجراء غير متاح لصلاحيات حسابك.',
        VIP_REQUIRED: 'هذه الميزة تتطلب عضوية VIP.', VIP_CIRCLE_LIMIT: 'إنشاء المجموعات متاح مع VIP، حتى 3 مجموعات.',
        MFA_REQUIRED: 'أكّد رمز المصادقة في صفحة الأمان أولًا.', MFA_INVALID: 'الرمز غير صحيح أو استُخدم سابقًا. جرّب الرمز التالي.',
        MFA_SETUP_REQUIRED: 'أكمل إعداد تطبيق المصادقة أولًا.', MFA_ALREADY_ENABLED: 'المصادقة الثنائية مفعّلة بالفعل.',
        INVALID_CREDENTIALS: 'تحقق من كلمة المرور.', LAST_SUPER_ADMIN: 'لا يمكن إزالة آخر مسؤول رئيسي.',
        TARGET_MFA_REQUIRED: 'يجب أن يفعّل هذا الحساب المصادقة الثنائية أولًا.',
        INVITE_INVALID: 'الدعوة غير صالحة أو انتهت مدتها.', INVITE_USED: 'استُخدمت الدعوة بالفعل.',
        COHORT_FULL: 'وصلت المجموعة إلى حد الأعضاء.', RATE_LIMITED: 'انتظر قليلًا ثم حاول مرة أخرى.',
        SESSION_EXPIRED: 'انتهت الجلسة. ابدأ جلسة جديدة.', SESSION_CLOSED: 'أُغلقت الجلسة بالفعل.',
        ALREADY_SUBSCRIBED: 'عضوية VIP مفعّلة بالفعل.', CHECKOUT_EXPIRED: 'انتهت جلسة الدفع. ابدأ تجربة جديدة.',
        ROOM_NOT_OWNED: 'اختر غرفة تملكها أو غرفة مرتبطة بهذه المجموعة.', ROOM_SCOPE_CONFLICT: 'الغرفة مرتبطة بمجموعة أخرى.',
        SCHEDULE_INVALID: 'اختر عنوانًا وموعدًا مستقبليًا صحيحًا.', DURATION_INVALID: 'المدة من 5 إلى 240 دقيقة.',
        NAME_REQUIRED: 'أدخل اسمًا صحيحًا.', USER_NOT_FOUND: 'لم نجد الحساب.', SERVICE_UNAVAILABLE: 'الخدمة غير متاحة مؤقتًا.',
        BOOTSTRAP_CLOSED: 'أُعدّ المسؤول الرئيسي بالفعل.', DISPOSITION_REQUIRED: 'اكتب سبب القرار.',
        OWNER_PROTECTED: 'لا يمكن إزالة مالك المجموعة.', COHORT_NOT_FOUND: 'المجموعة غير متاحة لحسابك.',
        MEMBER_NOT_FOUND: 'العضو غير موجود.', INVITE_UNAVAILABLE: 'لا يمكن قبول الدعوة الآن؛ تواصل مع مالك المجموعة.',
        googleMfa: 'لإعداد مصادقة الموظفين، أعد التحقق من حساب Google أولًا.'
    });
    const en = {
        unresolvedPayments: 'Test payments needing review',
        paymentReviewHelp: 'Verification does not create a new charge. Attempts without a payment reference need investigation with the provider.',
        recheckPayment: 'Recheck payment', activateReviewedPayment: 'Activate verified payment after review',
        transactionHint: 'Provider transaction reference (optional)', olderOrders: 'Show older attempts',
        PAYMENT_AWAITING_NOTIFICATION: 'No transaction reference is available. Investigate the attempt with the provider.',
        PAYMENT_MISMATCH: 'Provider details do not match this payment attempt. Membership has not changed.',
        pending: 'Pending', unknown: 'Unconfirmed', review: 'Needs review', creating: 'Creating', refunded: 'Refunded', expired: 'Expired',
        pageTitle: 'Your workspace — Halastudy', workspaceNav: 'Workspace navigation', skip: 'Skip to content',
        theme: 'Theme', account: 'Account', home: 'My workspace', progress: 'Progress', circles: 'Study circles',
        vip: 'VIP membership', security: 'Security', staff: 'Operations', openRoom: 'Open a room',
        loading: 'Preparing your workspace…', welcome: 'A little room for focus', guestTitle: 'One session closer',
        guestBody: 'Sign in to save your progress, study with your circle, and manage your membership.',
        signIn: 'Sign in', continueGuest: 'Join as a guest', homeTitle: 'Make room for focus',
        homeBody: 'Start a quiet session. Let your progress grow, one step at a time.', lobby: 'Enter the lobby',
        yourRooms: 'Rooms you manage', roomHistory: 'Room history', yourRhythm: 'At your own pace',
        progressTitle: 'Time worth counting', progressBody: 'Sessions count while you stay connected. Your camera is optional, and membership never changes your points.',
        currentSession: 'Focus session', start: 'Start a session', pause: 'Pause', finish: 'Finish session',
        focusRule: 'One completed minute earns one point, up to 240 daily. Long interruptions do not count. Your previous history stays in your account.',
        achievements: 'Your achievements', recentSessions: 'Recent sessions', export: 'Export CSV', together: 'Good company',
        circlesTitle: 'Meet here. Focus together.', circlesBody: 'Private circles with individual invitations, assigned supervisors, and attendance for each session.',
        circleName: 'Circle name', createCircle: 'Create a circle', circleVipNote: 'Creating circles is a VIP benefit. Free accounts can accept invitations and participate.',
        inviteCode: 'Invitation code', joinCircle: 'Join circle', createInvite: 'Create a single-use invitation',
        members: 'Members', scheduleSession: 'Schedule a circle session', sessionTitle: 'Session title', room: 'Room',
        startsAt: 'Start in your device timezone', minutes: 'Validated minutes', schedule: 'Save session', scheduledSessions: 'Circle sessions',
        privateRoomNotice: 'Linking a room restricts entry to circle members. Its existing password still applies.',
        simpleMembership: 'One membership. Clear benefits.', vipTitle: 'A little more room with VIP',
        vipBody: 'Study rooms, the timer, and basic progress stay free. Add organization and history when you need them.',
        testNotice: 'Local test mode — no payment details are collected and no money is charged.',
        free: 'Free', freeStudy: 'Study rooms, timer, and existing scheduling',
        freeProgress: 'Points, achievements, and 30 days of validated session history', freeInvites: 'Accept study-circle invitations',
        monthly: 'per month', vipHistory: 'One year of validated session history', vipExport: 'Export your progress as CSV',
        vipCircles: 'Create 3 private circles with up to 12 members each', vipSupervision: 'Assign circle supervisors, schedule sessions, and review attendance',
        tryCheckout: 'Try test checkout', membership: 'Your membership', cancelRenewal: 'Cancel renewal',
        checkoutTitle: 'Test checkout simulator', checkoutBody: 'VIP — US$4.99 per month. Choose a test outcome. This simulator never charges or renews a real payment.',
        simulateSuccess: 'Simulate successful payment', simulateDecline: 'Simulate declined payment', cancel: 'Cancel',
        peaceOfMind: 'Peace of mind', securityTitle: 'Your account. Clear boundaries.',
        securityBody: 'Staff use two-factor authentication. Supervisors can access only their assigned circles.',
        accountId: 'Your account ID', setupMfa: 'Set up your authenticator', password: 'Current password', beginSetup: 'Begin setup',
        secretInstruction: 'Scan with your authenticator app or enter the secret manually. Keep it private.',
        verifyMfa: 'Verify your authenticator', otp: 'Code or recovery code', verify: 'Verify',
        staffSession: 'Staff verification lasts 15 minutes. Sensitive changes are recorded with the person responsible.',
        recoveryTitle: 'Save your recovery codes', recoveryBody: 'Shown only now. Each code works once. Save them safely before leaving this page.',
        bootstrapTitle: 'Set up the first owner', bootstrapBody: 'After enabling MFA, enter the existing operator password to link operations to your account. This closes after the first super admin is created.',
        adminPassword: 'Existing operator password', bootstrapAction: 'Create named super-admin access',
        staffWorkspace: 'Team workspace', staffTitle: 'Accountable operations',
        staffLock: 'Verify your authenticator on the Security page to open staff tools.',
        roleAssignments: 'Team permissions', targetAccount: 'Staff account ID', role: 'Role', grant: 'Grant role',
        reports: 'Reports', subscriptions: 'Subscriptions', audit: 'Action history', privacy: 'Privacy', terms: 'Terms',
        greeting: 'Welcome,', sessions: 'Completed sessions', xp: 'Focus points', streak: 'Day streak',
        emptyRooms: 'New rooms you create appear here. Earlier rooms remain in your account history.',
        emptySessions: 'Your first session is a good beginning. Start when you are ready.',
        emptyCircles: 'Your circles appear here after creating one or accepting an invitation.',
        emptyAchievements: 'Your first achievement arrives after one completed focus minute.',
        first_session: 'First session', focus_100: '100 focus minutes', focus_1000: '1,000 focus minutes',
        active: 'Focusing', paused: 'Paused', completed: 'Completed', abandoned: 'Unfinished', noSession: 'Ready when you are',
        resume: 'Resume', rename: 'Rename', save: 'Save', join: 'Enter room', view: 'View',
        supervisor: 'Circle supervisor', member: 'Member', owner: 'Circle owner', makeSupervisor: 'Assign supervisor',
        makeMember: 'Make member', remove: 'Remove', attendance: 'Attendance', on_time: 'On time', late: 'Late',
        absent: 'No attendance recorded', noData: 'Nothing here yet.', subscriptionActive: 'Test VIP membership is active until',
        subscriptionCancels: 'Membership ends on', keepMembership: 'Keep membership', signInForVip: 'Sign in to try VIP',
        checkoutUnavailable: 'Checkout is unavailable until a payment provider is configured.',
        checkoutDeclined: 'Declined payment simulated. Your membership did not change.', checkoutCanceled: 'Test checkout canceled.',
        checkoutSuccess: 'Test VIP activated. No money was charged.', saved: 'Saved.', inviteReady: 'Single-use code, valid for 48 hours:',
        mfaReady: 'Verified. Staff tools are available for 15 minutes.', revoke: 'Revoke', staffCount: 'Accounts',
        roomCount: 'Rooms', participants: 'Present', disposition: 'Decision reason', resolve: 'Resolve report',
        dismiss: 'Dismiss report', investigating: 'Investigating', resolved: 'Resolved', dismissed: 'Dismissed', open: 'Open',
        confirmRemove: 'Confirm removal', roleModerator: 'Moderator', roleSupport: 'Support', roleBilling: 'Billing',
        roleAdmin: 'Platform admin', roleSuperAdmin: 'Super admin', securitySaved: 'Save your recovery codes now.',
        genericError: 'We could not complete that request. Please try again.', networkError: 'Connection interrupted. Disconnected time does not count.',
        AUTH_REQUIRED: 'Sign in to continue.', FORBIDDEN: 'Your account cannot perform this action.', VIP_REQUIRED: 'This feature requires VIP.',
        VIP_CIRCLE_LIMIT: 'VIP can create up to 3 circles.', MFA_REQUIRED: 'Verify your authenticator on the Security page first.',
        MFA_INVALID: 'Invalid or previously used code. Try the next code.', MFA_SETUP_REQUIRED: 'Set up your authenticator first.',
        MFA_ALREADY_ENABLED: 'Two-factor authentication is already enabled.', INVALID_CREDENTIALS: 'Check your password.',
        LAST_SUPER_ADMIN: 'The last super admin cannot be removed.', TARGET_MFA_REQUIRED: 'That account must enable MFA first.',
        INVITE_INVALID: 'This invitation is invalid or expired.', INVITE_USED: 'This invitation has already been used.',
        COHORT_FULL: 'The circle has reached its member limit.', RATE_LIMITED: 'Please wait a moment before trying again.',
        SESSION_EXPIRED: 'This session expired. Start a new session.', SESSION_CLOSED: 'This session is already closed.',
        ALREADY_SUBSCRIBED: 'VIP is already active.', CHECKOUT_EXPIRED: 'Checkout expired. Start another test.',
        ROOM_NOT_OWNED: 'Choose your own room or one already linked to this circle.', ROOM_SCOPE_CONFLICT: 'This room belongs to another circle.',
        SCHEDULE_INVALID: 'Enter a title and a valid future time.', DURATION_INVALID: 'Duration must be 5–240 minutes.',
        NAME_REQUIRED: 'Enter a valid name.', USER_NOT_FOUND: 'Account not found.', SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
        BOOTSTRAP_CLOSED: 'The first super admin is already configured.', DISPOSITION_REQUIRED: 'Enter a reason for this decision.',
        OWNER_PROTECTED: 'The circle owner cannot be removed.', COHORT_NOT_FOUND: 'This circle is unavailable to your account.',
        MEMBER_NOT_FOUND: 'Member not found.', INVITE_UNAVAILABLE: 'This invitation is unavailable. Contact the circle owner.',
        googleMfa: 'Reverify your Google identity before setting up staff authentication.'
        , googleVerify: 'Reverify with Google'
    };
    let user = null;
    let state = null;
    let progress = null;
    let ownedRooms = [];
    let selectedCircle = null;
    let identityKnown = false;
    let circleRequest = 0;
    let requestedCircleId = null;
    let checkout = null;
    let providerOrder = null;
    Object.assign(ar, {
        digetpayTitle: 'الدفع التجريبي عبر DigetPay',
        digetpayBody: 'تجربة عضوية لمدة شهر بسعر 4.99 دولار أمريكي. لا يُخصم مبلغ فعلي ولا يوجد تجديد تلقائي. استخدم بيانات الاختبار فقط.',
        digetpayNotice: 'وضع DigetPay التجريبي — استخدم بطاقات الاختبار فقط. لا يوجد خصم فعلي أو تجديد تلقائي.',
        paymentPhone: 'رقم جوال سعودي', continueDigetpay: 'متابعة إلى DigetPay التجريبي',
        paymentResultTitle: 'حالة الدفع', verifyPayment: 'تحقق من حالة الدفع', tryDigetpay: 'جرّب الدفع عبر DigetPay',
        paymentPending: 'لم نتأكد من الدفع بعد. يمكنك إعادة التحقق هنا؛ لا تبدأ دفعة أخرى.',
        paymentCompleted: 'تم التحقق من الدفع التجريبي. هذه الدفعة لعضوية لمدة شهر دون تجديد تلقائي.',
        paymentRefunded: 'تم التحقق من استرداد المبلغ وإيقاف العضوية المرتبطة بهذه الدفعة.',
        paymentReview: 'تحتاج محاولة الدفع إلى مراجعة. لم يتم إنشاء محاولة دفع أخرى.',
        paymentExpired: 'انتهت مهلة صفحة الدفع. تحقق من الحالة قبل المحاولة مجددًا.',
        PAYMENT_PHONE_INVALID: 'أدخل رقم جوال سعوديًا صحيحًا مثل 0501234567.',
        PAYMENT_REVIEW_REQUIRED: 'تحتاج محاولة الدفع إلى مراجعة. تحقق من حالتها قبل المحاولة مجددًا.',
        CHECKOUT_UNCONFIGURED: 'الدفع غير متاح حاليًا.',
        BILLING_RENEWAL_UNAVAILABLE: 'التجديد التلقائي غير مفعّل.',
        CHECKOUT_NOT_FOUND: 'لم نجد محاولة الدفع في حسابك.'
    });
    Object.assign(en, {
        digetpayTitle: 'DigetPay sandbox checkout',
        digetpayBody: 'Test one month of VIP for US$4.99. No real charge or automatic renewal. Use test payment details only.',
        digetpayNotice: 'DigetPay sandbox — use test cards only. No real charge or automatic renewal.',
        paymentPhone: 'Saudi mobile number', continueDigetpay: 'Continue to DigetPay sandbox',
        paymentResultTitle: 'Payment status', verifyPayment: 'Check payment status', tryDigetpay: 'Try DigetPay checkout',
        paymentPending: 'Payment is not verified yet. Check again here; do not start another payment.',
        paymentCompleted: 'Test payment verified. This purchase covers one month with no automatic renewal.',
        paymentRefunded: 'Refund verified. The membership linked to this payment has ended.',
        paymentReview: 'This payment attempt needs review. Another payment attempt has not been created.',
        paymentExpired: 'The checkout page has expired. Check its status before trying again.',
        PAYMENT_PHONE_INVALID: 'Enter a valid Saudi mobile number, such as 0501234567.',
        PAYMENT_REVIEW_REQUIRED: 'This payment attempt needs review. Check its status before trying again.',
        CHECKOUT_UNCONFIGURED: 'Checkout is currently unavailable.',
        BILLING_RENEWAL_UNAVAILABLE: 'Automatic renewal is not enabled.',
        CHECKOUT_NOT_FOUND: 'This payment attempt was not found in your account.'
    });
    Object.assign(ar, {
    "studyNav": "المذاكرة",
    "groupsNav": "المجموعات",
    "account": "حسابي",
    "accountTitle": "حسابك وخياراتك",
    "accountBody": "الملف الشخصي وسجل الغرف وإعدادات الأمان في مكان واحد.",
    "profileHistory": "الملف الشخصي وسجل الغرف",
    "continueStudy": "أكمل مذاكرتك",
    "nextSession": "موعدك القادم",
    "noRecentRoom": "لا توجد غرفة سابقة متاحة. افتح غرفة جديدة عندما تكون جاهزًا.",
    "noNextSession": "لا يوجد موعد قادم متاح. يمكنك الدراسة الآن أو الاطلاع على مجموعاتك.",
    "todayMinutes": "دقائق اليوم الموثّقة",
    "todayRule": "دقائق اليوم من الجلسات المكتملة، بتوقيت الرياض (Asia/Riyadh).",
    "passwordReminder": "قد تحتاج كلمة مرور الغرفة.",
    "recapTitle": "انتهت جلستك",
    "anotherSession": "ابدأ جلسة أخرى",
    "savedSession": "حُفظت في حسابك.",
    "shortSession": "لم تكتمل دقيقة موثّقة؛ لا نقاط لهذه الجلسة.",
    "elapsed": "المدة المنقضية",
    "credited": "الدقائق الموثّقة",
    "recapRule": "المدة المنقضية تشمل التوقف والانقطاع؛ تُحسب النقاط من الوقت الموثّق فقط.",
    "insightsTitle": "عدادات استخدام اختيارية على جهازك",
    "insightsBody": "معطّلة افتراضيًا. تُحفظ أعداد الإجراءات وفئات المدة فقط لمدة 7 أيام على هذا المتصفح، دون إرسالها إلى أي جهة. لا تتضمن أسماء أو رموز غرف أو محتوى. إيقافها يحذفها.",
    "insightsEnable": "اسمح بالعدادات المحلية على هذا المتصفح",
    "insightsReset": "امسح العدادات وأوقفها",
    "insightsOn": "العدادات المحلية مفعّلة لمدة 7 أيام من موافقتك.",
    "insightsOff": "العدادات معطّلة. يمكنك الدراسة كالمعتاد.",
    "security": "الأمان",
    "vip": "عضوية VIP",
    "staff": "الإدارة"
});
    Object.assign(en, {
        studyNav: 'Study', groupsNav: 'Groups', accountTitle: 'Your account and choices',
        accountBody: 'Your profile, room history and security settings in one place.', profileHistory: 'Profile and room history',
        continueStudy: 'Continue studying', nextSession: 'Your next session', noRecentRoom: 'No previous room is available. Open a new room when you are ready.',
        noNextSession: 'No upcoming session is available. Study now or check your groups.',
        todayMinutes: 'Credited minutes today', todayRule: 'Today’s minutes from completed sessions, in Riyadh time (Asia/Riyadh).',
        passwordReminder: 'The room may require its password.', recapTitle: 'Your session is complete', anotherSession: 'Start another session',
        savedSession: 'Saved to your account.', shortSession: 'Less than one credited minute; no points for this session.',
        elapsed: 'Elapsed time', credited: 'Credited minutes', recapRule: 'Elapsed time includes pauses and interruptions; points use validated time only.'
    });
    Object.assign(en, { insightsTitle: 'Optional on-device usage counters', insightsBody: 'Off by default. Only action counts and duration ranges stay in this browser for 7 days, with no transfers. No names, room codes or content. Turning this off deletes the counters.', insightsEnable: 'Allow local counters in this browser', insightsReset: 'Clear counters and turn off', insightsOn: 'Local counters enabled for 7 days from consent.', insightsOff: 'Counters are off. Study continues as usual.' });
    Object.assign(ar, { completionUnconfirmed: 'لم نتأكد من حفظ نهاية الجلسة. أعد الاتصال ثم حاول إنهاء الجلسة مجددًا.' });
    Object.assign(en, { completionUnconfirmed: 'Completion could not be confirmed. Reconnect, then retry Finish session.' });
    let dashboard = null;
    let recap = null;
    let enrolling = false;
    let currentView = location.pathname === '/plans' ? 'vip' : location.hash.slice(1) || (location.pathname === '/supervisor' ? 'circles' : 'home');
    const t = (key) => core.t(key) || en[key] || key;
    const api = (method, route, body) => core.requestJson(method, `/api/platform${route}`, body);
    const locale = () => core.getLang() === 'ar' ? 'ar-SA' : 'en-US';
    const date = (value) => global.HalaSchedule.format(value, core.getLang());
    let activeNotice = null;
    function renderNotice() {
        const visible = activeNotice?.view === currentView;
        $('feedback').textContent = visible ? t(activeNotice.key) : '';
        $('feedback').hidden = !visible;
        $('feedback').classList.toggle('error', !!(visible && activeNotice.error));
    }
    function notice(key, error = false, view = currentView) {
        if (view !== currentView) return;
        activeNotice = key ? { key, error, view } : null;
        renderNotice();
    }
    function noticeError(error, view = currentView) {
        notice(ar[error?.code] || en[error?.code] ? error.code : 'genericError', true, view);
    }
    function node(tag, text, className = '') {
        const element = document.createElement(tag);
        element.textContent = text;
        element.className = className;
        return element;
    }
    function button(label, action) {
        const element = node('button', label);
        element.type = 'button';
        element.addEventListener('click', () => void work(element, action));
        return element;
    }
    async function work(element, action) {
        const view = currentView;
        notice('');
        element.disabled = true;
        try { await action(); } catch (error) { noticeError(error, view); }
        finally { element.disabled = false; }
    }
    function bindForm(id, action) {
        $(id).addEventListener('submit', (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            void work(form.querySelector('button'), () => action(Object.fromEntries(new FormData(form)), form));
        });
    }
    function row(title, detail, actions = []) {
        const item = node('div', '', 'row');
        const meta = node('div', '', 'row-main');
        meta.append(node('strong', title), node('small', detail));
        const controls = node('div', '', 'actions');
        controls.append(...actions);
        item.append(meta, controls);
        return item;
    }
    function fill(id, children, empty = 'noData') {
        $(id).replaceChildren(...(children.length ? children : [node('p', t(empty), 'empty')]));
    }
    function metrics(id, values) {
        $(id).replaceChildren(...Object.entries(values).map(([key, value]) => {
            const item = node('div', '', 'metric');
            item.append(node('strong', Number(value).toLocaleString(locale())), node('span', t(key)));
            return item;
        }));
    }
    function renderProgress() {
        if (!progress) return;
        metrics('home-metrics', { todayMinutes: dashboard?.today.minutes || 0 });
        metrics('progress-metrics', progress.totals);
        fill('achievements', progress.achievements.map((entry) => node('span', t(entry.achievement_key), 'badge')), 'emptyAchievements');
        fill('session-history', progress.sessions.map((entry) => row(
            date(entry.started_at), `${Math.floor(Number(entry.credited_ms) / 60000)} · ${t('minutes')} · ${entry.xp} ${t('xp')} · ${t(entry.state)}`
        )), 'emptySessions');
        $('export-progress').hidden = !state?.benefits.features['progress.export'];
        renderFocus();
    }
    function renderFocus() {
        const session = global.HalaFocus.current();
        const open = session && ['active', 'paused'].includes(session.state);
        const seconds = global.HalaFocus.displaySeconds();
        $('focus-clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        $('focus-state').textContent = open ? t(session.state) : t('noSession');
        $('focus-start').hidden = !!open;
        $('focus-pause').hidden = !open;
        $('focus-finish').hidden = !open;
        $('focus-pause').textContent = session?.state === 'paused' ? t('resume') : t('pause');
    }
    function roomLink(id) {
        const link = node('a', t('join'), 'button');
        link.href = `/study?room=${encodeURIComponent(id)}`;
        return link;
    }
    function renderDashboard() {
        const room = dashboard?.recentRoom;
        fill('return-room', room ? [row(room.name, room.passwordProtected ? t('passwordReminder') : '', [roomLink(room.id)])] : [], 'noRecentRoom');
        const session = dashboard?.nextSession;
        fill('next-session', session ? [row(session.title, date(session.starts_at), [roomLink(session.room_id)])] : [], 'noNextSession');
    }
    function renderRecap() {
        $('focus-recap').hidden = !recap;
        if (!recap) return;
        const minutes = Math.floor(Number(recap.credited_ms) / 60000);
        const elapsed = Math.max(0, Math.floor((Number(recap.completed_at) - Number(recap.started_at)) / 1000));
        $('recap-values').textContent = `${t('elapsed')}: ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')} · ${t('credited')}: ${minutes} · ${t('xp')}: ${Number(recap.xp)}`;
        $('recap-note').textContent = `${t('savedSession')} ${minutes < 1 ? t('shortSession') : t('recapRule')}`;
    }
    function renderRooms() {
        fill('owned-rooms', ownedRooms.filter((room) => room.exists).map((room) => {
            const link = node('a', t('join'), 'button');
            link.href = `/study?room=${encodeURIComponent(room.id)}`;
            const rename = button(t('rename'), async () => {
                const form = document.createElement('form');
                form.className = 'inline-form';
                const input = document.createElement('input');
                input.value = room.name;
                input.maxLength = 48;
                input.required = true;
                input.setAttribute('aria-label', t('rename'));
                const save = node('button', t('save'));
                form.append(input, save);
                form.addEventListener('submit', (event) => {
                    event.preventDefault();
                    void work(save, async () => {
                        await api('PATCH', `/rooms/${encodeURIComponent(room.id)}`, { name: input.value });
                        await refresh();
                        notice('saved');
                    });
                });
                rename.closest('.row').append(form);
                rename.remove();
                input.focus();
            });
            return row(room.name, room.id, room.can_manage ? [link, rename] : [link]);
        }), 'emptyRooms');
    }
    function renderCircles() {
        const vip = state?.benefits.plan.id === 'vip';
        $('circle-create').hidden = !vip;
        $('circle-vip-note').hidden = vip;
        fill('circle-list', (state?.cohorts || []).map((circle) => row(
            circle.name, `${circle.member_count} · ${t('members')} · ${t(circle.owner_id === user?.id ? 'owner' : circle.member_role)}`,
            [button(t('view'), () => showCircle(circle))]
        )), 'emptyCircles');
    }
    async function showCircle(circle) {
        const request = ++circleRequest;
        requestedCircleId = circle.id;
        selectedCircle = null;
        $('circle-detail').hidden = true;
        $('invite-result').hidden = true;
        $('invite-code').textContent = '';
        $('attendance').replaceChildren();
        const [members, sessions] = await Promise.all([api('GET', `/cohorts/${circle.id}/members`), api('GET', `/cohorts/${circle.id}/sessions`)]);
        if (request !== circleRequest) return;
        selectedCircle = circle;
        const owner = circle.owner_id === user.id;
        const supervisor = owner || circle.member_role === 'supervisor';
        $('circle-detail').hidden = false;
        $('circle-title').textContent = circle.name;
        $('circle-exit').textContent = t(owner ? 'archiveCircle' : 'leaveCircle');
        $('create-invite').hidden = !owner || state.benefits.plan.id !== 'vip';
        $('invite-result').hidden = true;
        $('session-create').hidden = !supervisor;
        $('session-room').replaceChildren(...ownedRooms.filter((room) => room.exists && (!room.cohort_id || room.cohort_id === circle.id)).map((room) => {
            const option = node('option', room.name); option.value = room.id; return option;
        }));
        fill('circle-members', members.members.map((member) => {
            const actions = [];
            if (owner && member.user_id !== user.id) {
                actions.push(button(t(member.role === 'supervisor' ? 'makeMember' : 'makeSupervisor'), async () => {
                    await api('PATCH', `/cohorts/${circle.id}/members/${member.user_id}`, { role: member.role === 'supervisor' ? 'member' : 'supervisor' });
                    if (selectedCircle?.id === circle.id) await showCircle(circle);
                }));
                actions.push(button(t('remove'), async () => {
                    await api('PATCH', `/cohorts/${circle.id}/members/${member.user_id}`, { role: 'remove' });
                    if (selectedCircle?.id === circle.id) await showCircle(circle);
                }));
            }
            return row(member.display_name, t(member.role), actions);
        }));
        fill('circle-sessions', sessions.sessions.map((session) => {
            const join = node('a', t('join'), 'button');
            join.href = `/study?room=${encodeURIComponent(session.room_id)}`;
            const actions = [
                join,
                button(t('attendance'), async () => {
                    const result = await api('GET', `/cohorts/${circle.id}/sessions/${session.id}/attendance`);
                    if (request !== circleRequest) return;
                    fill('attendance', result.attendance.map((entry) => row(entry.display_name, t(entry.status))));
                })
            ];
            if (supervisor && Number(session.starts_at) > Date.now()) actions.push(button(t('cancelSession'), async () => {
                if (!window.confirm(t('cancelSessionConfirm'))) return;
                await api('DELETE', `/cohorts/${circle.id}/sessions/${session.id}`);
                if (selectedCircle?.id === circle.id) await showCircle(circle);
            }));
            return row(session.title, `${date(session.starts_at)} · ${session.duration_minutes}`, actions);
        }));
    }
    function renderBilling() {
        const subscription = state?.benefits.subscription;
        const billing = state?.billing;
        const digetpay = billing?.provider === 'digetpay';
        $('test-notice').hidden = state?.mode !== 'test';
        $('test-notice').textContent = t(digetpay ? 'digetpayNotice' : 'testNotice');
        $('checkout-start').hidden = !!subscription;
        $('checkout-start').disabled = !identityKnown || (!!user && !billing?.checkoutAvailable);
        $('checkout-start').textContent = user ? t(digetpay ? 'tryDigetpay' : 'tryCheckout') : t('signInForVip');
        $('plan-status').textContent = !billing?.checkoutAvailable && user ? t('checkoutUnavailable') : '';
        if (!digetpay || subscription || !billing?.checkoutAvailable) $('digetpay-checkout').hidden = true;
        $('billing-management').hidden = !subscription;
        $('billing-cancel').hidden = digetpay || subscription?.provider === 'digetpay';
        if (subscription) {
            $('billing-status').textContent = `${t(subscription.cancel_at_period_end ? 'subscriptionCancels' : 'subscriptionActive')} ${date(subscription.period_end)}`;
            $('billing-cancel').textContent = t(subscription.cancel_at_period_end ? 'keepMembership' : 'cancelRenewal');
        }
        $('payment-result').hidden = !providerOrder;
        if (providerOrder) {
            const key = providerOrder.verificationPending ? 'paymentPending' : ({
                completed: 'paymentCompleted', refunded: 'paymentRefunded', expired: 'paymentExpired',
                unknown: 'paymentReview', creating: 'paymentReview', review: 'paymentReview'
            }[providerOrder.status] || 'paymentPending');
            $('payment-result-text').textContent = t(key);
        }
    }
    Object.assign(ar, {
        archiveCircle: 'أرشفة المجموعة', leaveCircle: 'مغادرة المجموعة', upcoming: 'لم تبدأ الجلسة',
        CIRCLE_VIP_REQUIRED: 'يحتاج مالك المجموعة إلى عضوية VIP نشطة لإضافة مواعيد أو مشرفين.',
        archiveConfirm: 'أرشفة المجموعة تغلق غرفها وتوقف الدعوات. هل تريد المتابعة؟', leaveConfirm: 'هل تريد مغادرة هذه المجموعة؟',
        cancelSession: 'إلغاء الموعد', cancelSessionConfirm: 'هل تريد إلغاء هذا الموعد؟', SESSION_NOT_CANCELABLE: 'لا يمكن إلغاء جلسة بدأت بالفعل.',
        operationsTitle: 'تشغيل المنصة', operationsNote: 'إعداد الفيديو والإعلانات مؤقتان حتى إعادة تشغيل الخادم. تغيير الفيديو يخص الاتصالات الجديدة.',
        backupNow: 'إنشاء نسخة احتياطية', announcementAr: 'الإعلان بالعربية', announcementEn: 'الإعلان بالإنجليزية',
        announcementDuration: 'مدة الظهور بالدقائق', publishAnnouncement: 'عرض الإعلان', clearAnnouncement: 'إزالة الإعلان',
        accountModeration: 'إدارة الحسابات', searchAccounts: 'اسم أو بريد أو معرّف الحساب', search: 'بحث',
        disableVideo: 'إيقاف دخول الفيديو', enableVideo: 'السماح بدخول الفيديو', closeRoom: 'إغلاق الغرفة',
        kickParticipant: 'إخراج المشارك', banAccount: 'حظر الحساب', unbanAccount: 'إلغاء الحظر', actionReason: 'سبب الإجراء',
        ACTION_INVALID: 'تحقق من الحساب وسبب الإجراء.', SUPER_ADMIN_PROTECTED: 'حساب المسؤول الرئيسي محمي من الحظر.',
        LOBBY_PROTECTED: 'الغرفة العامة دائمة.', VALUE_INVALID: 'تحقق من القيم المدخلة.'
    });
    Object.assign(en, {
        alertsTitle: 'Recent operational alerts', alertsEmpty: 'No alerts recorded.',
        alertLocal: 'Alerts are stored locally. External notifications are not configured.',
        alertExternal: 'External notifications are configured.', alertStorage: 'The alert journal could not be saved.',
        account_rollback_persist_failed: 'Account rollback failed', video_revocation_failed: 'Video access revocation failed',
        video_revocation_persist_failed: 'Video revocation storage failed', video_revocation_start_failed: 'Video journal unavailable',
        database_lease_lost: 'Database ownership lost', database_connection_failed: 'Database connection lost',
        storage_shutdown_failed: 'Shutdown persistence failed', backup_failed: 'Backup failed', backup_stale: 'Backup overdue',
        authentication_rejected: 'Elevated rejected sign-ins', socket_handler_failed: 'Room connection errors',
        attendance_sweep_failed: 'Attendance refresh failed', account_recovery_delivery_failed: 'Recovery message failed',
        video_provider_request_failed: 'Video provider errors',
        archiveCircle: 'Archive circle', leaveCircle: 'Leave circle', upcoming: 'Not started',
        CIRCLE_VIP_REQUIRED: 'The circle owner needs active VIP to add sessions or supervisors.',
        archiveConfirm: 'Archiving closes this circle’s rooms and invitations. Continue?', leaveConfirm: 'Leave this circle?',
        cancelSession: 'Cancel session', cancelSessionConfirm: 'Cancel this scheduled session?', SESSION_NOT_CANCELABLE: 'A session that has started cannot be canceled.',
        operationsTitle: 'Platform operations', operationsNote: 'Video and announcements reset when the server restarts. The video switch affects new connections.',
        backupNow: 'Create backup', announcementAr: 'Arabic announcement', announcementEn: 'English announcement',
        announcementDuration: 'Display for minutes', publishAnnouncement: 'Show announcement', clearAnnouncement: 'Clear announcement',
        accountModeration: 'Account moderation', searchAccounts: 'Account name, email or ID', search: 'Search',
        disableVideo: 'Disable video entry', enableVideo: 'Allow video entry', closeRoom: 'Close room',
        kickParticipant: 'Remove participant', banAccount: 'Ban account', unbanAccount: 'Unban account', actionReason: 'Reason for this action',
        ACTION_INVALID: 'Check the account and reason.', SUPER_ADMIN_PROTECTED: 'Super-admin accounts cannot be banned.',
        LOBBY_PROTECTED: 'The public lobby is permanent.', VALUE_INVALID: 'Check the entered values.'
    });
    function reasonAction(label, perform) {
        const control = button(label, async () => {
            const form = document.createElement('form');
            form.className = 'inline-form';
            const input = document.createElement('input');
            input.required = true; input.maxLength = 250; input.placeholder = t('actionReason'); input.setAttribute('aria-label', t('actionReason'));
            const submit = node('button', label);
            form.append(input, submit);
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                void work(submit, async () => { await perform(input.value); form.remove(); await renderStaff(); notice('saved'); });
            });
            control.closest('.row').append(form);
            control.remove(); input.focus();
        });
        return control;
    }
    async function searchStaffUsers() {
        const result = await api('GET', `/staff/users?q=${encodeURIComponent($('staff-query').value)}`);
        fill('staff-users', result.users.map((entry) => row(entry.displayName, entry.id, [
            reasonAction(t(entry.banned ? 'unbanAccount' : 'banAccount'), async (reason) => {
                await api('POST', `/staff/users/${entry.id}/status`, { reason, banned: !entry.banned });
                await searchStaffUsers();
            })
        ])));
    }
    function paymentReviewAction(entry, lookup, activateReview) {
        const label = t(activateReview ? 'activateReviewedPayment' : 'recheckPayment');
        const control = button(label, async () => {
            const form = document.createElement('form');
            form.className = 'inline-form';
            const reason = document.createElement('input');
            reason.required = true; reason.minLength = 3; reason.maxLength = 250;
            reason.placeholder = t('actionReason'); reason.setAttribute('aria-label', t('actionReason'));
            const reference = document.createElement('input');
            reference.maxLength = 36; reference.placeholder = t('transactionHint'); reference.setAttribute('aria-label', t('transactionHint'));
            const submit = node('button', label);
            form.append(reason);
            if (lookup === 'transaction') form.append(reference);
            form.append(submit);
            form.addEventListener('submit', event => {
                event.preventDefault();
                void work(submit, async () => {
                    const result = await api('POST', `/staff/payment-orders/${entry.id}/recheck`, {
                        reason: reason.value, transactionId: reference.value.trim() || undefined, activateReview
                    });
                    await renderStaff();
                    notice(({ completed: 'paymentCompleted', refunded: 'paymentRefunded', expired: 'paymentExpired',
                        review: 'paymentReview', unknown: 'paymentReview', creating: 'paymentReview' })[result.status] || 'paymentPending');
                });
            });
            control.closest('.row').append(form); control.remove(); reason.focus();
        });
        return control;
    }
    async function renderPaymentOrders(cursor = '') {
        const result = await api('GET', `/staff/payment-orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
        fill('payment-orders', result.orders.map(entry => row(entry.id,
            `${entry.user_id} · ${t(entry.status)} · ${date(entry.created_at)}${entry.last_error ? ` · ${entry.last_error}` : ''}`,
            state.permissions.includes('staff.manage') ? [paymentReviewAction(entry, result.lookup, entry.status === 'review')] : [])));
        $('payment-orders-more').replaceChildren(...(result.nextCursor
            ? [button(t('olderOrders'), () => renderPaymentOrders(result.nextCursor))] : []));
    }
    async function renderStaff() {
        if (!state) return;
        $('staff-lock').hidden = state.staffVerified;
        $('staff-content').hidden = !state.staffVerified;
        if (!state.staffVerified) return;
        const permissions = state.permissions;
        if (permissions.includes('operations.read')) metrics('staff-overview', await api('GET', '/staff/overview'));
        $('staff-operations-section').hidden = !permissions.includes('operations.read');
        $('staff-users-section').hidden = !permissions.includes('cases.manage');
        $('video-gate').hidden = !permissions.includes('operations.manage');
        $('announcement-form').hidden = !permissions.includes('operations.manage');
        $('platform-backup').hidden = !permissions.includes('backups.manage');
        if (permissions.includes('operations.read')) {
            const operations = await api('GET', '/staff/operations');
            $('staff-monitoring-status').textContent = t(operations.monitoring?.storageHealthy === false
                ? 'alertStorage' : operations.monitoring?.deliveryConfigured ? 'alertExternal' : 'alertLocal');
            const alerts = (operations.alerts || []).filter((entry) => !entry.resolvedAt);
            fill('staff-alerts', alerts.map((entry) => row(t(entry.event), `${entry.count} · ${date(entry.lastSeenAt)}`)), 'alertsEmpty');
            $('video-gate').textContent = t(operations.videoDisabled ? 'enableVideo' : 'disableVideo');
            $('video-gate').dataset.disabled = String(operations.videoDisabled);
            const result = await api('GET', '/staff/rooms');
            fill('staff-live-rooms', result.rooms.map((entry) => {
                const actions = [];
                if (permissions.includes('operations.manage')) {
                    if (entry.id !== 'LOBBY') actions.push(reasonAction(t('closeRoom'), (reason) => api('POST', `/staff/rooms/${entry.id}/close`, { reason })));
                    for (const person of entry.participants) actions.push(reasonAction(`${t('kickParticipant')}: ${person.name}`,
                        (reason) => api('POST', `/staff/rooms/${entry.id}/kick`, { reason, socketId: person.socketId })));
                }
                return row(entry.name, `${entry.id} · ${entry.participants.length}`, actions);
            }));
        }
        $('staff-roles-section').hidden = !permissions.includes('staff.read');
        $('staff-grant').hidden = !permissions.includes('staff.manage');
        if (permissions.includes('staff.read')) {
            const result = await api('GET', '/staff');
            fill('staff-roles', result.assignments.map((entry) => row(entry.display_name, roleName(entry.role),
                permissions.includes('staff.manage') ? [button(t('revoke'), async () => {
                    await api('POST', '/staff/roles', { userId: entry.user_id, role: entry.role, remove: true });
                    await refresh();
                })] : [])));
        }
        $('staff-cases-section').hidden = !permissions.includes('cases.read');
        if (permissions.includes('cases.read')) {
            const result = await api('GET', '/staff/cases');
            fill('staff-cases', result.cases.map((entry) => {
                const item = row(entry.reason, `${entry.detail} · ${t(entry.status)}`);
                if (permissions.includes('cases.manage')) {
                    const form = document.createElement('form');
                    form.className = 'inline-form';
                    const input = document.createElement('input');
                    input.required = true; input.maxLength = 500; input.setAttribute('aria-label', t('disposition')); input.placeholder = t('disposition');
                    const submit = node('button', t('resolve'));
                    form.append(input, submit);
                    form.addEventListener('submit', (event) => {
                        event.preventDefault();
                        void work(submit, async () => {
                            await api('PATCH', `/staff/cases/${entry.id}`, { status: 'resolved', disposition: input.value });
                            await renderStaff();
                        });
                    });
                    item.append(form);
                }
                return item;
            }));
        }
        $('staff-billing-section').hidden = !permissions.includes('billing.read');
        if (permissions.includes('billing.read')) {
            const result = await api('GET', '/staff/subscriptions');
            fill('staff-billing', result.subscriptions.map((entry) => row(`VIP · US$4.99 · ${entry.mode}`, `${entry.user_id} · ${t(entry.status)} · ${date(entry.period_end)}`)));
            $('payment-review-section').hidden = state.billing?.provider !== 'digetpay';
            if (!$('payment-review-section').hidden) await renderPaymentOrders();
        }
        $('staff-audit-section').hidden = !permissions.includes('audit.read');
        if (permissions.includes('audit.read')) {
            const result = await api('GET', '/staff/audit');
            fill('staff-audit', result.events.map((entry) => row(entry.action, `${entry.actor_id || '—'} · ${date(entry.created_at)}`)));
        }
    }
    function roleName(role) {
        return t({ moderator: 'roleModerator', support: 'roleSupport', billing_operator: 'roleBilling', admin: 'roleAdmin', super_admin: 'roleSuperAdmin' }[role] || role);
    }
    function renderInsights() {
        const enabled = global.HalaInsights?.enabled() || false;
        $('insights-consent').checked = enabled;
        $('insights-status').textContent = t(enabled ? 'insightsOn' : 'insightsOff');
        const labels = core.getLang() === 'ar' ? {
            entry: 'اختيار البداية', create: 'فتح غرفة', join: 'دخول غرفة', success: 'نجح', invalid: 'تعذّر الدخول', full: 'ممتلئة', denied: 'غير مسموح', network: 'تعذّر الاتصال',
            under5s: 'أقل من 5 ثوانٍ', under30s: 'من 5 إلى 29 ثانية', longer: '30 ثانية فأكثر',
            focus: 'تركيز', start: 'بدء', complete: 'إنهاء', room: 'الغرفة', workspace: 'مساحتك', none: 'دون وقت موثّق', under1m: 'أقل من دقيقة موثّقة', '1to24m': 'من 1 إلى 24 دقيقة موثّقة', '25plus': '25 دقيقة موثّقة فأكثر',
            return: 'عودة إلى الموقع', sameDay: 'خلال يوم من الموافقة', later: 'بعد يوم من الموافقة'
        } : {
            entry: 'Starting choice', create: 'Open a room', join: 'Room entry', success: 'Successful', invalid: 'Could not join', full: 'Full', denied: 'Not permitted', network: 'Connection unavailable',
            under5s: 'Under 5 seconds', under30s: '5–29 seconds', longer: '30 seconds or more',
            focus: 'Focus', start: 'Started', complete: 'Completed', room: 'Room', workspace: 'Workspace', none: 'No credited time', under1m: 'Under one credited minute', '1to24m': '1–24 credited minutes', '25plus': '25 or more credited minutes',
            return: 'Return visit', sameDay: 'Within a day of consent', later: 'After a day from consent'
        };
        $('insights-summary').replaceChildren(...(enabled ? Object.entries(global.HalaInsights.summary()).map(([key, count]) =>
            node('li', `${key.split(':').map((part) => labels[part]).join(' · ')}: ${count}`)) : []));
    }
    function render() {
        renderInsights();
        $('schedule-zone').textContent = global.HalaSchedule.zone();
        $('greeting').textContent = `${t('greeting')} ${user?.displayName || ''}`;
        $('account-id').textContent = user?.id || '';
        $('staff-nav').hidden = !state?.roles?.length;
        $('bootstrap').hidden = !state?.bootstrapAvailable || !state?.staffVerified;
        const google = user?.authProvider === 'google';
        const googleVerified = new URLSearchParams(location.search).get('security') === 'verified';
        $('google-security').hidden = !google || state?.mfaEnabled || googleVerified;
        $('mfa-password-label').hidden = google;
        $('mfa-password').required = !google;
        $('mfa-enroll').hidden = state?.mfaEnabled || (google && !googleVerified);
        renderProgress(); renderDashboard(); renderRecap(); renderRooms(); renderCircles(); renderBilling();
    }
    function showView(focus = false) {
        if (!['home','progress','circles','account','vip','security','staff'].includes(currentView)) currentView = 'home';
        document.title = `${t({ account: 'accountTitle', home: 'homeTitle', progress: 'progressTitle', circles: 'circlesTitle', vip: 'vipTitle', security: 'securityTitle', staff: 'staffTitle' }[currentView])} — Halastudy`;
        document.querySelectorAll('[data-panel]').forEach((panel) => {
            panel.toggleAttribute('hidden', !state || panel.getAttribute('data-panel') !== currentView || (!user && currentView !== 'vip'));
        });
        $('guest').querySelector('a.primary').href = `/account?next=${encodeURIComponent(currentView === 'vip' ? '/plans' : `/app#${currentView}`)}`;
        $('guest').hidden = !state || !identityKnown || !!user || currentView === 'vip';
        document.querySelectorAll('[data-view]').forEach((link) => {
            if (link.getAttribute('data-view') === currentView || (link.closest('.platform-nav') && link.getAttribute('data-view') === 'account' && ['vip', 'security', 'staff'].includes(currentView))) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        if (activeNotice?.view !== currentView) activeNotice = null;
        renderNotice();
        if (focus) {
            const heading = document.querySelector(`[data-panel="${currentView}"]:not([hidden]) h1`);
            if (heading instanceof HTMLElement) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
        }
        if (currentView === 'staff' && state) void renderStaff().catch((error) => noticeError(error, 'staff'));
    }
    async function refresh() {
        if (!user) return;
        [state, progress, { rooms: ownedRooms }, dashboard] = await Promise.all([api('GET', '/me'), api('GET', '/progress'), api('GET', '/rooms'), api('GET', '/dashboard')]);
        global.HalaFocus.restore(progress.current);
        render();
        showView();
    }
    core.initLang({ ar, en });
    core.onLangChange(() => { render(); showView(); if (selectedCircle) void showCircle(selectedCircle).catch(() => {}); });
    $('theme-toggle').addEventListener('click', core.toggleTheme);
    document.querySelectorAll('[data-view]').forEach((link) => { link.addEventListener('click', (event) => {
        const click = /** @type {MouseEvent} */ (event);
        if (click.button || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return;
        event.preventDefault();
        const nextView = link.getAttribute('data-view');
        if (currentView !== nextView) {
            currentView = nextView;
            history.pushState(null, '', currentView === 'vip' ? '/plans' : `/app#${currentView}`);
        }
        showView(true);
    }); });
    function restoreView() {
        const nextView = location.pathname === '/plans' ? 'vip' : location.hash.slice(1) || (location.pathname === '/supervisor' ? 'circles' : 'home');
        if (currentView !== nextView) { currentView = nextView; showView(true); }
    }
    window.addEventListener('popstate', restoreView);
    window.addEventListener('hashchange', restoreView);
    window.addEventListener('halafocuschange', renderFocus);
    setInterval(() => { if (currentView === 'progress') renderFocus(); }, 1000);
    window.addEventListener('halafocuserror', () => notice('networkError', true));
    $('focus-start').addEventListener('click', () => void work($('focus-start'), async () => { recap = null; renderRecap(); await global.HalaFocus.start(); }));
    $('focus-pause').addEventListener('click', () => void work($('focus-pause'), () =>
        global.HalaFocus.current()?.state === 'paused' ? global.HalaFocus.start() : global.HalaFocus.pause()));
    $('focus-finish').addEventListener('click', () => void work($('focus-finish'), async () => {
        const view = currentView;
        let result;
        try { result = await global.HalaFocus.complete(); }
        catch { notice('completionUnconfirmed', true, view); return; }
        if (result?.state === 'completed') { recap = result; renderRecap(); }
        await refresh();
        if (currentView === 'progress' && recap) $('focus-recap').focus();
    }));
    $('insights-consent').addEventListener('change', () => { global.HalaInsights?.consent($('insights-consent').checked); renderInsights(); });
    $('insights-reset').addEventListener('click', () => { global.HalaInsights?.consent(false); renderInsights(); });
    $('recap-next').addEventListener('click', () => $('focus-start').click());
    bindForm('circle-create', async (data, form) => {
        await api('POST', '/cohorts', { name: data.name || $('circle-name').value });
        form.reset(); await refresh(); notice('saved');
    });
    bindForm('invite-accept', async (_data, form) => {
        await api('POST', '/cohorts/accept', { token: $('invite-token').value.trim() });
        form.reset(); await refresh(); notice('saved');
    });
    $('create-invite').addEventListener('click', () => void work($('create-invite'), async () => {
        const circle = selectedCircle;
        const request = circleRequest;
        if (!circle) return;
        const result = await api('POST', `/cohorts/${circle.id}/invitations`, {});
        if (request !== circleRequest) return;
        $('invite-result').hidden = false;
        $('invite-code').textContent = result.token;
    }));
    $('circle-exit').addEventListener('click', () => void work($('circle-exit'), async () => {
        const circle = selectedCircle;
        if (!circle) return;
        const owner = circle.owner_id === user.id;
        if (!window.confirm(t(owner ? 'archiveConfirm' : 'leaveConfirm'))) return;
        await api('POST', `/cohorts/${circle.id}/${owner ? 'archive' : 'leave'}`, {});
        if (requestedCircleId === circle.id) {
            ++circleRequest; requestedCircleId = null; selectedCircle = null; $('circle-detail').hidden = true;
        }
        await refresh(); notice('saved');
    }));
    bindForm('session-create', async (data, form) => {
        const circle = selectedCircle;
        if (!circle) return;
        await api('POST', `/cohorts/${circle.id}/sessions`, { ...data, startsAt: new Date(String(data.startsAt)).getTime(), durationMinutes: Number(data.durationMinutes) });
        if (selectedCircle?.id === circle.id) { form.reset(); await showCircle(circle); }
        notice('saved');
    });
    $('checkout-start').addEventListener('click', () => void work($('checkout-start'), async () => {
        if (!user) { location.assign('/account?next=%2Fplans'); return; }
        if (state.billing?.provider === 'digetpay') {
            $('digetpay-checkout').hidden = false;
            $('digetpay-checkout').querySelector('input').focus();
            return;
        }
        checkout = await api('POST', '/billing/checkout', {});
        $('test-checkout').hidden = false; $('test-checkout').focus();
    }));
    bindForm('digetpay-checkout', async (data) => {
        try {
            providerOrder = await api('POST', '/billing/checkout', { phone: String(data.phone).trim() });
            renderBilling();
            if (providerOrder.redirectUrl) {
                // Defense in depth: the backend also validates the exact origin,
                // checkout path and session ID before persisting this URL.
                const url = new URL(providerOrder.redirectUrl);
                if (!['https://pay-staging.digetpay.com', 'https://fin-admin.digetpay.com'].includes(url.origin)
                    || url.pathname !== '/pay/checkout') throw new Error('CHECKOUT_UNCONFIGURED');
                location.assign(url.href);
            }
        } catch (error) {
            ({ order: providerOrder } = await api('GET', '/billing/latest'));
            renderBilling();
            throw error;
        }
    });
    $('payment-verify').addEventListener('click', () => void work($('payment-verify'), async () => {
        if (!providerOrder) return;
        providerOrder = await api('POST', `/billing/checkout/${encodeURIComponent(providerOrder.id)}/verify`, {});
        await refresh();
    }));
    document.querySelectorAll('[data-checkout-outcome]').forEach((element) => { element.addEventListener('click', () => void work(element, async () => {
        const outcome = element.getAttribute('data-checkout-outcome');
        await api('POST', `/billing/checkout/${checkout.id}/complete`, { token: checkout.token, outcome });
        checkout = null; $('test-checkout').hidden = true;
        await refresh();
        notice(outcome === 'success' ? 'checkoutSuccess' : outcome === 'declined' ? 'checkoutDeclined' : 'checkoutCanceled');
    })); });
    $('billing-cancel').addEventListener('click', () => void work($('billing-cancel'), async () => {
        await api('POST', '/billing/cancellation', { cancelAtPeriodEnd: !state.benefits.subscription.cancel_at_period_end });
        await refresh(); notice('saved');
    }));
    bindForm('mfa-enroll', async (data, form) => {
        const result = await api('POST', '/security/mfa/enroll', data);
        form.reset(); enrolling = true;
        $('mfa-secret').hidden = false; $('mfa-qr').src = result.qr; $('mfa-key').textContent = result.secret;
    });
    bindForm('mfa-verify', async (data, form) => {
        const result = await api('POST', '/security/mfa/verify', { ...data, activate: enrolling });
        form.reset(); enrolling = false; $('mfa-secret').hidden = true; $('mfa-key').textContent = ''; $('mfa-qr').removeAttribute('src');
        if (result.recoveryCodes.length) {
            $('recovery').hidden = false; $('recovery-codes').textContent = result.recoveryCodes.join('\n');
        }
        await refresh(); notice(result.recoveryCodes.length ? 'securitySaved' : 'mfaReady');
    });
    bindForm('bootstrap', async (data, form) => { await api('POST', '/staff/bootstrap', data); form.reset(); await refresh(); notice('saved'); });
    bindForm('staff-grant', async (data, form) => { await api('POST', '/staff/roles', data); form.reset(); await refresh(); notice('saved'); });
    bindForm('staff-user-search', searchStaffUsers);
    bindForm('announcement-form', async (data, form) => { await api('POST', '/staff/announcement', data); form.reset(); notice('saved'); });
    $('video-gate').addEventListener('click', () => void work($('video-gate'), async () => {
        await api('POST', '/staff/video', { disabled: $('video-gate').dataset.disabled !== 'true' }); await renderStaff();
    }));
    $('platform-backup').addEventListener('click', () => void work($('platform-backup'), async () => { await api('POST', '/staff/backup', {}); notice('saved'); }));
    $('clear-announcement').addEventListener('click', () => void work($('clear-announcement'), async () => { await api('DELETE', '/staff/announcement'); notice('saved'); }));
    async function boot() {
        try {
            user = await global.HalaAuth.getUser();
            identityKnown = true;
            if (user) await refresh();
            else {
                const catalog = await api('GET', '/catalog');
                state = { mode: catalog.mode, billing: catalog, benefits: { plan: { id: 'free' }, features: {} } };
                render(); showView();
            }
            if (user && state.billing?.provider === 'digetpay') {
                ({ order: providerOrder } = await api('GET', '/billing/latest'));
                const returnedId = new URLSearchParams(location.search).get('checkout');
                if (returnedId) {
                    try { providerOrder = await api('POST', `/billing/checkout/${encodeURIComponent(returnedId)}/verify`, {}); }
                    catch (error) { noticeError(error); }
                    await refresh();
                }
                renderBilling();
            }
        } catch (error) {
            noticeError(error);
            core.showUnavailable(null, () => global.location.reload());
            showView();
        } finally { $('loading').hidden = true; }
    }
    void boot();
})();
