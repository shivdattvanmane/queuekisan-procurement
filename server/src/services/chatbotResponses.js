// ============================================================
// QUEUEKISAN CHATBOT MULTILINGUAL RESPONSES
// ============================================================

const chatbotResponses = {

  TOKEN_NUMBER: {
    noBooking: {
      en: 'You do not have an active booking.',
      hi: 'आपकी कोई सक्रिय बुकिंग उपलब्ध नहीं है।',
      mr: 'तुमची कोणतीही सक्रिय बुकिंग उपलब्ध नाही.',
      hi_roman: 'Aapki koi active booking available nahi hai.',
      mr_roman: 'Tumchi kontihi active booking available nahi.',
      hinglish: 'Aapki koi active booking nahi hai.'
    },

    answer: {
      en: (value) => `Your token number is ${value}.`,
      hi: (value) => `आपका टोकन नंबर ${value} है।`,
      mr: (value) => `तुमचा टोकन नंबर ${value} आहे.`,
      hi_roman: (value) => `Aapka token number ${value} hai.`,
      mr_roman: (value) => `Tumcha token number ${value} aahe.`,
      hinglish: (value) => `Aapka token number ${value} hai.`
    }
  },


  QUEUE_POSITION: {
    noBooking: {
      en: 'You do not have an active queue.',
      hi: 'आपकी सक्रिय कतार उपलब्ध नहीं है।',
      mr: 'तुमची सक्रिय रांग उपलब्ध नाही.',
      hi_roman: 'Aapki active queue available nahi hai.',
      mr_roman: 'Tumchi active queue available nahi.',
      hinglish: 'Aapki active queue nahi hai.'
    },

    answer: {
      en: (value) =>
        `There are ${value} farmer(s) ahead of you.`,

      hi: (value) =>
        `आपके आगे ${value} किसान हैं।`,

      mr: (value) =>
        `तुमच्या पुढे ${value} शेतकरी आहेत.`,

      hi_roman: (value) =>
        `Aapke aage ${value} kisan hain.`,

      mr_roman: (value) =>
        `Tumchya pudhe ${value} shetkari aahet.`,

      hinglish: (value) =>
        `Aapke aage ${value} farmers hain.`
    }
  },


  WAITING_TIME: {
    noBooking: {
      en: 'Your waiting-time information is not available.',
      hi: 'आपके प्रतीक्षा समय की जानकारी उपलब्ध नहीं है।',
      mr: 'तुमच्या प्रतीक्षा वेळेची माहिती उपलब्ध नाही.',
      hi_roman: 'Aapke waiting time ki information available nahi hai.',
      mr_roman: 'Tumchya waiting time chi mahiti available nahi.',
      hinglish: 'Aapka waiting time available nahi hai.'
    },

    answer: {
      en: (value) =>
        `Your estimated waiting time is ${value}.`,

      hi: (value) =>
        `आपका अनुमानित प्रतीक्षा समय ${value} है।`,

      mr: (value) =>
        `तुमचा अंदाजे प्रतीक्षा वेळ ${value} आहे.`,

      hi_roman: (value) =>
        `Aapka estimated waiting time ${value} hai.`,

      mr_roman: (value) =>
        `Tumcha estimated waiting time ${value} aahe.`,

      hinglish: (value) =>
        `Aapka estimated wait ${value} hai.`
    }
  },


  BOOKING_STATUS: {
    noBooking: {
      en: 'You do not have an active booking.',
      hi: 'आपकी कोई सक्रिय बुकिंग नहीं है।',
      mr: 'तुमची कोणतीही सक्रिय बुकिंग नाही.',
      hi_roman: 'Aapki koi active booking nahi hai.',
      mr_roman: 'Tumchi kontihi active booking nahi.',
      hinglish: 'Aapki active booking nahi hai.'
    },

    answer: {
      en: (value) =>
        `Your booking status is ${value}.`,

      hi: (value) =>
        `आपकी बुकिंग की स्थिति ${value} है।`,

      mr: (value) =>
        `तुमच्या बुकिंगची स्थिती ${value} आहे.`,

      hi_roman: (value) =>
        `Aapki booking ka status ${value} hai.`,

      mr_roman: (value) =>
        `Tumchya bookingchi sthiti ${value} aahe.`,

      hinglish: (value) =>
        `Aapki booking ka status ${value} hai.`
    }
  },


  CENTRE_INFO: {
    noBooking: {
      en: 'Your centre information is not available.',
      hi: 'आपके केंद्र की जानकारी उपलब्ध नहीं है।',
      mr: 'तुमच्या केंद्राची माहिती उपलब्ध नाही.',
      hi_roman: 'Aapke centre ki information available nahi hai.',
      mr_roman: 'Tumchya centrechi mahiti available nahi.',
      hinglish: 'Aapka centre available nahi hai.'
    },

    answer: {
      en: (value) =>
        `Your procurement centre is ${value}.`,

      hi: (value) =>
        `आपका खरीद केंद्र ${value} है।`,

      mr: (value) =>
        `तुमचे खरेदी केंद्र ${value} आहे.`,

      hi_roman: (value) =>
        `Tumcha procurement centre ${value} aahe.`,

      mr_roman: (value) =>
        `Tumcha kharedi kendra ${value} aahe.`,

      hinglish: (value) =>
        `Aapka procurement centre ${value} hai.`
    }
  },


  CROP_INFO: {
    noBooking: {
      en: 'Your crop information is not available.',
      hi: 'आपकी फसल की जानकारी उपलब्ध नहीं है।',
      mr: 'तुमच्या पिकाची माहिती उपलब्ध नाही.',
      hi_roman: 'Aapki crop information available nahi hai.',
      mr_roman: 'Tumchya pikachi mahiti available nahi.',
      hinglish: 'Aapki crop information available nahi hai.'
    },

    answer: {
      en: (value) =>
        `Your booked crop is ${value}.`,

      hi: (value) =>
        `आपने ${value} फसल बुक की है।`,

      mr: (value) =>
        `तुम्ही ${value} पीक बुक केले आहे.`,

      hi_roman: (value) =>
        `Aapne ${value} fasal book ki hai.`,

      mr_roman: (value) =>
        `Tumhi ${value} peek book kele aahe.`,

      hinglish: (value) =>
        `Aapne ${value} crop book ki hai.`
    }
  },


  CURRENT_SERVING: {
    noBooking: {
      en: 'Current serving-token information is not available.',
      hi: 'वर्तमान टोकन की जानकारी उपलब्ध नहीं है।',
      mr: 'सध्याच्या टोकनची माहिती उपलब्ध नाही.',
      hi_roman: 'Current token ki information available nahi hai.',
      mr_roman: 'Sadhyachya tokenchi mahiti available nahi.',
      hinglish: 'Current serving token available nahi hai.'
    },

    answer: {
      en: (value) =>
        `Token ${value} is currently being served.`,

      hi: (value) =>
        `अभी ${value} टोकन चल रहा है।`,

      mr: (value) =>
        `सध्या ${value} टोकन चालू आहे.`,

      hi_roman: (value) =>
        `Abhi ${value} token chal raha hai.`,

      mr_roman: (value) =>
        `Sadhya ${value} token chalu aahe.`,

      hinglish: (value) =>
        `Abhi ${value} token serve ho raha hai.`
    }
  },


  GREETING: {
    en:
      'Namaste! 👋 I am the QueueKisan Assistant. I can help you with your booking and queue.',

    hi:
      'नमस्ते! 👋 मैं QueueKisan Assistant हूँ। मैं आपकी बुकिंग और कतार के बारे में मदद कर सकता हूँ।',

    mr:
      'नमस्कार! 👋 मी QueueKisan सहाय्यक आहे. मी तुमच्या बुकिंग आणि रांगेबद्दल मदत करू शकतो.',

    hi_roman:
      'Namaste! 👋 Main QueueKisan Assistant hoon. Main aapki booking aur queue ke baare mein help kar sakta hoon.',

    mr_roman:
      'Namaskar! 👋 Mi QueueKisan Assistant aahe. Mi tumchya booking ani rangebaddal madat karu shakto.',

    hinglish:
      'Namaste! 👋 Main QueueKisan Assistant hoon. Main aapki booking aur queue mein help kar sakta hoon.'
  },


  HELP: {
    en:
      'I can help with your token number, queue position, waiting time, booking status, procurement centre and crop information.',

    hi:
      'मैं आपके टोकन नंबर, कतार की स्थिति, प्रतीक्षा समय, बुकिंग स्थिति, खरीद केंद्र और फसल की जानकारी दे सकता हूँ।',

    mr:
      'मी तुमचा टोकन नंबर, रांगेतील स्थान, प्रतीक्षा वेळ, बुकिंग स्थिती, खरेदी केंद्र आणि पिकाची माहिती देऊ शकतो.',

    hi_roman:
      'Main aapke token number, queue position, waiting time, booking status, procurement centre aur crop information mein help kar sakta hoon.',

    mr_roman:
      'Mi tumcha token number, rangeatil position, waiting time, booking status, kharedi kendra ani pikachi mahiti deu shakto.',

    hinglish:
      'Main aapke token, queue position, waiting time, booking status, centre aur crop information mein help kar sakta hoon.'
  },


  OTHER: {
    en:
      'Sorry, I could not understand your question. Please ask about your token, queue, waiting time or booking.',

    hi:
      'माफ कीजिए, मैं आपका प्रश्न समझ नहीं पाया। कृपया टोकन, कतार, प्रतीक्षा समय या बुकिंग के बारे में पूछें।',

    mr:
      'माफ करा, मला तुमचा प्रश्न समजला नाही. कृपया टोकन, रांग, प्रतीक्षा वेळ किंवा बुकिंगबद्दल विचारा.',

    hi_roman:
      'Sorry, main aapka question samajh nahi paya. Please token, queue, waiting time ya booking ke baare mein poochiye.',

    mr_roman:
      'Sorry, mala tumcha question samajla nahi. Please token, queue, waiting time kiwa booking baddal vichara.',

    hinglish:
      'Sorry, main aapka question samajh nahi paya. Token, queue, waiting time ya booking ke baare mein poochiye.'
  }
};


// ============================================================
// GET RESPONSE
// ============================================================

function getChatbotResponse(intent, language, value = null, hasBooking = true) {

  const supportedLanguages = [
    'en',
    'hi',
    'mr',
    'hi_roman',
    'mr_roman',
    'hinglish'
  ];

  const safeLanguage =
    supportedLanguages.includes(language)
      ? language
      : 'en';

  const response =
    chatbotResponses[intent] ||
    chatbotResponses.OTHER;

  if (!hasBooking && response.noBooking) {
    return (
      response.noBooking[safeLanguage] ||
      response.noBooking.en
    );
  }

  if (typeof response[safeLanguage] === 'function') {
    return response[safeLanguage](value);
  }

  if (response.answer) {
    const template =
      response.answer[safeLanguage] ||
      response.answer.en;

    return typeof template === 'function'
      ? template(value)
      : template;
  }

  return (
    response[safeLanguage] ||
    response.en ||
    chatbotResponses.OTHER.en
  );
}


export {
  chatbotResponses,
  getChatbotResponse
};