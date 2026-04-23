// Agency database with jurisdictions
export const agencies = [
  // FEDERAL AGENCIES (Whole country)
  {
    id: "nema",
    name: "NEMA - National Emergency Management Agency",
    type: "emergency",
    email: "nema@example.gov.ng", // Replace with real email
    country: "Nigeria",
    jurisdiction: "national",
    scope: "all"
  },
  
  // FCT AREA (Abuja)
  {
    id: "fema-fct",
    name: "FCT Emergency Management Agency (FEMA)",
    type: "emergency",
    email: "fema@example.gov.ng",
    country: "Nigeria",
    state: "FCT",
    jurisdiction: "state",
    cities: ["Abuja", "Gwagwalada", "Kuje", "Bwari", "Kwali"]
  },
  {
    id: "fire-fct",
    name: "Federal Fire Service, Abuja",
    type: "fire",
    email: "fire-abuja@example.gov.ng",
    country: "Nigeria",
    state: "FCT",
    jurisdiction: "state",
    cities: ["Abuja", "Gwagwalada", "Kuje", "Bwari", "Kwali"]
  },
  
  // LAGOS STATE
  {
    id: "lasema",
    name: "Lagos State Emergency Management Agency (LASEMA)",
    type: "emergency",
    email: "lasema@example.gov.ng",
    country: "Nigeria",
    state: "Lagos",
    jurisdiction: "state",
    cities: ["Lagos", "Ikeja", "Victoria Island", "Lekki", "Badagry", "Epe", "Ikorodu"]
  },
  {
    id: "fire-lagos",
    name: "Lagos State Fire Service",
    type: "fire",
    email: "fire-lagos@example.gov.ng",
    country: "Nigeria",
    state: "Lagos",
    jurisdiction: "state",
    cities: ["Lagos", "Ikeja", "Victoria Island", "Lekki"]
  },
  
  // NORTH CENTRAL (Beyond FCT)
  {
    id: "nasarawa-emergency",
    name: "Nasarawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-nasarawa@example.gov.ng",
    country: "Nigeria",
    state: "Nasarawa",
    jurisdiction: "state",
    cities: ["Lafia", "Keffi", "Akwanga", "Nasarawa"]
  },
  {
    id: "plateau-emergency",
    name: "Plateau State Emergency Management Agency",
    type: "emergency",
    email: "sema-plateau@example.gov.ng",
    country: "Nigeria",
    state: "Plateau",
    jurisdiction: "state",
    cities: ["Jos", "Bukuru", "Pankshin", "Shendam"]
  },
  {
    id: "kwara-emergency",
    name: "Kwara State Emergency Management Agency",
    type: "emergency",
    email: "sema-kwara@example.gov.ng",
    country: "Nigeria",
    state: "Kwara",
    jurisdiction: "state",
    cities: ["Ilorin", "Offa", "Patigi", "Jebba"]
  },
  
  // SOUTH WEST
  {
    id: "ogun-emergency",
    name: "Ogun State Emergency Management Agency",
    type: "emergency",
    email: "sema-ogun@example.gov.ng",
    country: "Nigeria",
    state: "Ogun",
    jurisdiction: "state",
    cities: ["Abeokuta", "Ijebu Ode", "Sagamu", "Ota"]
  },
  {
    id: "oyo-emergency",
    name: "Oyo State Emergency Management Agency",
    type: "emergency",
    email: "sema-oyo@example.gov.ng",
    country: "Nigeria",
    state: "Oyo",
    jurisdiction: "state",
    cities: ["Ibadan", "Ogbomoso", "Oyo", "Saki"]
  },
  {
    id: "osun-emergency",
    name: "Osun State Emergency Management Agency",
    type: "emergency",
    email: "sema-osun@example.gov.ng",
    country: "Nigeria",
    state: "Osun",
    jurisdiction: "state",
    cities: ["Osogbo", "Ife", "Ilesa", "Ede"]
  },
  {
    id: "ekiti-emergency",
    name: "Ekiti State Emergency Management Agency",
    type: "emergency",
    email: "sema-ekiti@example.gov.ng",
    country: "Nigeria",
    state: "Ekiti",
    jurisdiction: "state",
    cities: ["Ado Ekiti", "Ikere", "Oye", "Efon"]
  },
  {
    id: "ondo-emergency",
    name: "Ondo State Emergency Management Agency",
    type: "emergency",
    email: "sema-ondo@example.gov.ng",
    country: "Nigeria",
    state: "Ondo",
    jurisdiction: "state",
    cities: ["Akure", "Ondo", "Owo", "Ore"]
  },
  
  // SOUTH EAST
  {
    id: "enugu-emergency",
    name: "Enugu State Emergency Management Agency",
    type: "emergency",
    email: "sema-enugu@example.gov.ng",
    country: "Nigeria",
    state: "Enugu",
    jurisdiction: "state",
    cities: ["Enugu", "Nsukka", "Oji River", "Agbani"]
  },
  {
    id: "anambra-emergency",
    name: "Anambra State Emergency Management Agency",
    type: "emergency",
    email: "sema-anambra@example.gov.ng",
    country: "Nigeria",
    state: "Anambra",
    jurisdiction: "state",
    cities: ["Awka", "Onitsha", "Nnewi", "Ekwulobia"]
  },
  {
    id: "imo-emergency",
    name: "Imo State Emergency Management Agency",
    type: "emergency",
    email: "sema-imo@example.gov.ng",
    country: "Nigeria",
    state: "Imo",
    jurisdiction: "state",
    cities: ["Owerri", "Okigwe", "Orlu", "Mbaise"]
  },
  {
    id: "abia-emergency",
    name: "Abia State Emergency Management Agency",
    type: "emergency",
    email: "sema-abia@example.gov.ng",
    country: "Nigeria",
    state: "Abia",
    jurisdiction: "state",
    cities: ["Umuahia", "Aba", "Ohafia", "Arochukwu"]
  },
  {
    id: "ebonyi-emergency",
    name: "Ebonyi State Emergency Management Agency",
    type: "emergency",
    email: "sema-ebonyi@example.gov.ng",
    country: "Nigeria",
    state: "Ebonyi",
    jurisdiction: "state",
    cities: ["Abakaliki", "Afikpo", "Onueke", "Ishieke"]
  },
  
  // SOUTH SOUTH
  {
    id: "rivers-emergency",
    name: "Rivers State Emergency Management Agency",
    type: "emergency",
    email: "sema-rivers@example.gov.ng",
    country: "Nigeria",
    state: "Rivers",
    jurisdiction: "state",
    cities: ["Port Harcourt", "Bonny", "Okrika", "Eleme"]
  },
  {
    id: "delta-emergency",
    name: "Delta State Emergency Management Agency",
    type: "emergency",
    email: "sema-delta@example.gov.ng",
    country: "Nigeria",
    state: "Delta",
    jurisdiction: "state",
    cities: ["Asaba", "Warri", "Sapele", "Ughelli"]
  },
  {
    id: "bayelsa-emergency",
    name: "Bayelsa State Emergency Management Agency",
    type: "emergency",
    email: "sema-bayelsa@example.gov.ng",
    country: "Nigeria",
    state: "Bayelsa",
    jurisdiction: "state",
    cities: ["Yenagoa", "Brass", "Ogbia", "Nembe"]
  },
  {
    id: "akwa-ibom-emergency",
    name: "Akwa Ibom State Emergency Management Agency",
    type: "emergency",
    email: "sema-akwaibom@example.gov.ng",
    country: "Nigeria",
    state: "Akwa Ibom",
    jurisdiction: "state",
    cities: ["Uyo", "Eket", "Ikot Ekpene", "Oron"]
  },
  {
    id: "cross-river-emergency",
    name: "Cross River State Emergency Management Agency",
    type: "emergency",
    email: "sema-crossriver@example.gov.ng",
    country: "Nigeria",
    state: "Cross River",
    jurisdiction: "state",
    cities: ["Calabar", "Ikom", "Ogoja", "Obudu"]
  },
  {
    id: "edo-emergency",
    name: "Edo State Emergency Management Agency",
    type: "emergency",
    email: "sema-edo@example.gov.ng",
    country: "Nigeria",
    state: "Edo",
    jurisdiction: "state",
    cities: ["Benin City", "Auchi", "Ekpoma", "Uromi"]
  },
  
  // NORTH EAST
  {
    id: "borno-emergency",
    name: "Borno State Emergency Management Agency",
    type: "emergency",
    email: "sema-borno@example.gov.ng",
    country: "Nigeria",
    state: "Borno",
    jurisdiction: "state",
    cities: ["Maiduguri", "Biu", "Bama", "Gwoza"]
  },
  {
    id: "yobe-emergency",
    name: "Yobe State Emergency Management Agency",
    type: "emergency",
    email: "sema-yobe@example.gov.ng",
    country: "Nigeria",
    state: "Yobe",
    jurisdiction: "state",
    cities: ["Damaturu", "Potiskum", "Gashua", "Nguru"]
  },
  {
    id: "adamawa-emergency",
    name: "Adamawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-adamawa@example.gov.ng",
    country: "Nigeria",
    state: "Adamawa",
    jurisdiction: "state",
    cities: ["Yola", "Mubi", "Numan", "Ganye"]
  },
  {
    id: "taraba-emergency",
    name: "Taraba State Emergency Management Agency",
    type: "emergency",
    email: "sema-taraba@example.gov.ng",
    country: "Nigeria",
    state: "Taraba",
    jurisdiction: "state",
    cities: ["Jalingo", "Wukari", "Bali", "Serti"]
  },
  {
    id: "gombe-emergency",
    name: "Gombe State Emergency Management Agency",
    type: "emergency",
    email: "sema-gombe@example.gov.ng",
    country: "Nigeria",
    state: "Gombe",
    jurisdiction: "state",
    cities: ["Gombe", "Billiri", "Kaltungo", "Dukku"]
  },
  {
    id: "bauchi-emergency",
    name: "Bauchi State Emergency Management Agency",
    type: "emergency",
    email: "sema-bauchi@example.gov.ng",
    country: "Nigeria",
    state: "Bauchi",
    jurisdiction: "state",
    cities: ["Bauchi", "Azare", "Misau", "Jama'are"]
  },
  
  // NORTH WEST
  {
    id: "kaduna-emergency",
    name: "Kaduna State Emergency Management Agency",
    type: "emergency",
    email: "sema-kaduna@example.gov.ng",
    country: "Nigeria",
    state: "Kaduna",
    jurisdiction: "state",
    cities: ["Kaduna", "Zaria", "Kafanchan", "Saminaka"]
  },
  {
    id: "kano-emergency",
    name: "Kano State Emergency Management Agency",
    type: "emergency",
    email: "sema-kano@example.gov.ng",
    country: "Nigeria",
    state: "Kano",
    jurisdiction: "state",
    cities: ["Kano", "Wudil", "Gaya", "Rano"]
  },
  {
    id: "katsina-emergency",
    name: "Katsina State Emergency Management Agency",
    type: "emergency",
    email: "sema-katsina@example.gov.ng",
    country: "Nigeria",
    state: "Katsina",
    jurisdiction: "state",
    cities: ["Katsina", "Daura", "Funtua", "Malumfashi"]
  },
  {
    id: "jigawa-emergency",
    name: "Jigawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-jigawa@example.gov.ng",
    country: "Nigeria",
    state: "Jigawa",
    jurisdiction: "state",
    cities: ["Dutse", "Hadejia", "Birnin Kudu", "Gumel"]
  },
  {
    id: "zamfara-emergency",
    name: "Zamfara State Emergency Management Agency",
    type: "emergency",
    email: "sema-zamfara@example.gov.ng",
    country: "Nigeria",
    state: "Zamfara",
    jurisdiction: "state",
    cities: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka"]
  },
  {
    id: "sokoto-emergency",
    name: "Sokoto State Emergency Management Agency",
    type: "emergency",
    email: "sema-sokoto@example.gov.ng",
    country: "Nigeria",
    state: "Sokoto",
    jurisdiction: "state",
    cities: ["Sokoto", "Tambuwal", "Gwadabawa", "Yabo"]
  },
  {
    id: "kebbi-emergency",
    name: "Kebbi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kebbi@example.gov.ng",
    country: "Nigeria",
    state: "Kebbi",
    jurisdiction: "state",
    cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru"]
  },
  {
    id: "niger-emergency",
    name: "Niger State Emergency Management Agency",
    type: "emergency",
    email: "sema-niger@example.gov.ng",
    country: "Nigeria",
    state: "Niger",
    jurisdiction: "state",
    cities: ["Minna", "Bida", "Kontagora", "Suleja"]
  },
  {
    id: "kwara-emergency",
    name: "Kwara State Emergency Management Agency",
    type: "emergency",
    email: "sema-kwara@example.gov.ng",
    country: "Nigeria",
    state: "Kwara",
    jurisdiction: "state",
    cities: ["Ilorin", "Offa", "Patigi", "Jebba"]
  },
  {
    id: "kogi-emergency",
    name: "Kogi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kogi@example.gov.ng",
    country: "Nigeria",
    state: "Kogi",
    jurisdiction: "state",
    cities: ["Lokoja", "Okene", "Idah", "Kabba"]
  },
  {
    id: "benue-emergency",
    name: "Benue State Emergency Management Agency",
    type: "emergency",
    email: "sema-benue@example.gov.ng",
    country: "Nigeria",
    state: "Benue",
    jurisdiction: "state",
    cities: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala"]
  },
  {
    id: "nasarawa-emergency",
    name: "Nasarawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-nasarawa@example.gov.ng",
    country: "Nigeria",
    state: "Nasarawa",
    jurisdiction: "state",
    cities: ["Lafia", "Keffi", "Akwanga", "Nasarawa"]
  },
  {
    id: "plateau-emergency",
    name: "Plateau State Emergency Management Agency",
    type: "emergency",
    email: "sema-plateau@example.gov.ng",
    country: "Nigeria",
    state: "Plateau",
    jurisdiction: "state",
    cities: ["Jos", "Bukuru", "Pankshin", "Shendam"]
  },
  {
    id: "taraba-emergency",
    name: "Taraba State Emergency Management Agency",
    type: "emergency",
    email: "sema-taraba@example.gov.ng",
    country: "Nigeria",
    state: "Taraba",
    jurisdiction: "state",
    cities: ["Jalingo", "Wukari", "Bali", "Serti"]
  },
  {
    id: "adamawa-emergency",
    name: "Adamawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-adamawa@example.gov.ng",
    country: "Nigeria",
    state: "Adamawa",
    jurisdiction: "state",
    cities: ["Yola", "Mubi", "Numan", "Ganye"]
  },
  {
    id: "borno-emergency",
    name: "Borno State Emergency Management Agency",
    type: "emergency",
    email: "sema-borno@example.gov.ng",
    country: "Nigeria",
    state: "Borno",
    jurisdiction: "state",
    cities: ["Maiduguri", "Biu", "Bama", "Gwoza"]
  },
  {
    id: "yobe-emergency",
    name: "Yobe State Emergency Management Agency",
    type: "emergency",
    email: "sema-yobe@example.gov.ng",
    country: "Nigeria",
    state: "Yobe",
    jurisdiction: "state",
    cities: ["Damaturu", "Potiskum", "Gashua", "Nguru"]
  },
  {
    id: "bauchi-emergency",
    name: "Bauchi State Emergency Management Agency",
    type: "emergency",
    email: "sema-bauchi@example.gov.ng",
    country: "Nigeria",
    state: "Bauchi",
    jurisdiction: "state",
    cities: ["Bauchi", "Azare", "Misau", "Jama'are"]
  },
  {
    id: "gombe-emergency",
    name: "Gombe State Emergency Management Agency",
    type: "emergency",
    email: "sema-gombe@example.gov.ng",
    country: "Nigeria",
    state: "Gombe",
    jurisdiction: "state",
    cities: ["Gombe", "Billiri", "Kaltungo", "Dukku"]
  },
  {
    id: "kaduna-emergency",
    name: "Kaduna State Emergency Management Agency",
    type: "emergency",
    email: "sema-kaduna@example.gov.ng",
    country: "Nigeria",
    state: "Kaduna",
    jurisdiction: "state",
    cities: ["Kaduna", "Zaria", "Kafanchan", "Saminaka"]
  },
  {
    id: "kano-emergency",
    name: "Kano State Emergency Management Agency",
    type: "emergency",
    email: "sema-kano@example.gov.ng",
    country: "Nigeria",
    state: "Kano",
    jurisdiction: "state",
    cities: ["Kano", "Wudil", "Gaya", "Rano"]
  },
  {
    id: "katsina-emergency",
    name: "Katsina State Emergency Management Agency",
    type: "emergency",
    email: "sema-katsina@example.gov.ng",
    country: "Nigeria",
    state: "Katsina",
    jurisdiction: "state",
    cities: ["Katsina", "Daura", "Funtua", "Malumfashi"]
  },
  {
    id: "jigawa-emergency",
    name: "Jigawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-jigawa@example.gov.ng",
    country: "Nigeria",
    state: "Jigawa",
    jurisdiction: "state",
    cities: ["Dutse", "Hadejia", "Birnin Kudu", "Gumel"]
  },
  {
    id: "zamfara-emergency",
    name: "Zamfara State Emergency Management Agency",
    type: "emergency",
    email: "sema-zamfara@example.gov.ng",
    country: "Nigeria",
    state: "Zamfara",
    jurisdiction: "state",
    cities: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka"]
  },
  {
    id: "sokoto-emergency",
    name: "Sokoto State Emergency Management Agency",
    type: "emergency",
    email: "sema-sokoto@example.gov.ng",
    country: "Nigeria",
    state: "Sokoto",
    jurisdiction: "state",
    cities: ["Sokoto", "Tambuwal", "Gwadabawa", "Yabo"]
  },
  {
    id: "kebbi-emergency",
    name: "Kebbi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kebbi@example.gov.ng",
    country: "Nigeria",
    state: "Kebbi",
    jurisdiction: "state",
    cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru"]
  },
  {
    id: "niger-emergency",
    name: "Niger State Emergency Management Agency",
    type: "emergency",
    email: "sema-niger@example.gov.ng",
    country: "Nigeria",
    state: "Niger",
    jurisdiction: "state",
    cities: ["Minna", "Bida", "Kontagora", "Suleja"]
  },
  {
    id: "kwara-emergency",
    name: "Kwara State Emergency Management Agency",
    type: "emergency",
    email: "sema-kwara@example.gov.ng",
    country: "Nigeria",
    state: "Kwara",
    jurisdiction: "state",
    cities: ["Ilorin", "Offa", "Patigi", "Jebba"]
  },
  {
    id: "kogi-emergency",
    name: "Kogi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kogi@example.gov.ng",
    country: "Nigeria",
    state: "Kogi",
    jurisdiction: "state",
    cities: ["Lokoja", "Okene", "Idah", "Kabba"]
  },
  {
    id: "benue-emergency",
    name: "Benue State Emergency Management Agency",
    type: "emergency",
    email: "sema-benue@example.gov.ng",
    country: "Nigeria",
    state: "Benue",
    jurisdiction: "state",
    cities: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala"]
  },
  {
    id: "nasarawa-emergency",
    name: "Nasarawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-nasarawa@example.gov.ng",
    country: "Nigeria",
    state: "Nasarawa",
    jurisdiction: "state",
    cities: ["Lafia", "Keffi", "Akwanga", "Nasarawa"]
  },
  {
    id: "plateau-emergency",
    name: "Plateau State Emergency Management Agency",
    type: "emergency",
    email: "sema-plateau@example.gov.ng",
    country: "Nigeria",
    state: "Plateau",
    jurisdiction: "state",
    cities: ["Jos", "Bukuru", "Pankshin", "Shendam"]
  },
  {
    id: "taraba-emergency",
    name: "Taraba State Emergency Management Agency",
    type: "emergency",
    email: "sema-taraba@example.gov.ng",
    country: "Nigeria",
    state: "Taraba",
    jurisdiction: "state",
    cities: ["Jalingo", "Wukari", "Bali", "Serti"]
  },
  {
    id: "adamawa-emergency",
    name: "Adamawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-adamawa@example.gov.ng",
    country: "Nigeria",
    state: "Adamawa",
    jurisdiction: "state",
    cities: ["Yola", "Mubi", "Numan", "Ganye"]
  },
  {
    id: "borno-emergency",
    name: "Borno State Emergency Management Agency",
    type: "emergency",
    email: "sema-borno@example.gov.ng",
    country: "Nigeria",
    state: "Borno",
    jurisdiction: "state",
    cities: ["Maiduguri", "Biu", "Bama", "Gwoza"]
  },
  {
    id: "yobe-emergency",
    name: "Yobe State Emergency Management Agency",
    type: "emergency",
    email: "sema-yobe@example.gov.ng",
    country: "Nigeria",
    state: "Yobe",
    jurisdiction: "state",
    cities: ["Damaturu", "Potiskum", "Gashua", "Nguru"]
  },
  {
    id: "bauchi-emergency",
    name: "Bauchi State Emergency Management Agency",
    type: "emergency",
    email: "sema-bauchi@example.gov.ng",
    country: "Nigeria",
    state: "Bauchi",
    jurisdiction: "state",
    cities: ["Bauchi", "Azare", "Misau", "Jama'are"]
  },
  {
    id: "gombe-emergency",
    name: "Gombe State Emergency Management Agency",
    type: "emergency",
    email: "sema-gombe@example.gov.ng",
    country: "Nigeria",
    state: "Gombe",
    jurisdiction: "state",
    cities: ["Gombe", "Billiri", "Kaltungo", "Dukku"]
  },
  {
    id: "kaduna-emergency",
    name: "Kaduna State Emergency Management Agency",
    type: "emergency",
    email: "sema-kaduna@example.gov.ng",
    country: "Nigeria",
    state: "Kaduna",
    jurisdiction: "state",
    cities: ["Kaduna", "Zaria", "Kafanchan", "Saminaka"]
  },
  {
    id: "kano-emergency",
    name: "Kano State Emergency Management Agency",
    type: "emergency",
    email: "sema-kano@example.gov.ng",
    country: "Nigeria",
    state: "Kano",
    jurisdiction: "state",
    cities: ["Kano", "Wudil", "Gaya", "Rano"]
  },
  {
    id: "katsina-emergency",
    name: "Katsina State Emergency Management Agency",
    type: "emergency",
    email: "sema-katsina@example.gov.ng",
    country: "Nigeria",
    state: "Katsina",
    jurisdiction: "state",
    cities: ["Katsina", "Daura", "Funtua", "Malumfashi"]
  },
  {
    id: "jigawa-emergency",
    name: "Jigawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-jigawa@example.gov.ng",
    country: "Nigeria",
    state: "Jigawa",
    jurisdiction: "state",
    cities: ["Dutse", "Hadejia", "Birnin Kudu", "Gumel"]
  },
  {
    id: "zamfara-emergency",
    name: "Zamfara State Emergency Management Agency",
    type: "emergency",
    email: "sema-zamfara@example.gov.ng",
    country: "Nigeria",
    state: "Zamfara",
    jurisdiction: "state",
    cities: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka"]
  },
  {
    id: "sokoto-emergency",
    name: "Sokoto State Emergency Management Agency",
    type: "emergency",
    email: "sema-sokoto@example.gov.ng",
    country: "Nigeria",
    state: "Sokoto",
    jurisdiction: "state",
    cities: ["Sokoto", "Tambuwal", "Gwadabawa", "Yabo"]
  },
  {
    id: "kebbi-emergency",
    name: "Kebbi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kebbi@example.gov.ng",
    country: "Nigeria",
    state: "Kebbi",
    jurisdiction: "state",
    cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru"]
  },
  {
    id: "niger-emergency",
    name: "Niger State Emergency Management Agency",
    type: "emergency",
    email: "sema-niger@example.gov.ng",
    country: "Nigeria",
    state: "Niger",
    jurisdiction: "state",
    cities: ["Minna", "Bida", "Kontagora", "Suleja"]
  },
  {
    id: "kwara-emergency",
    name: "Kwara State Emergency Management Agency",
    type: "emergency",
    email: "sema-kwara@example.gov.ng",
    country: "Nigeria",
    state: "Kwara",
    jurisdiction: "state",
    cities: ["Ilorin", "Offa", "Patigi", "Jebba"]
  },
  {
    id: "kogi-emergency",
    name: "Kogi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kogi@example.gov.ng",
    country: "Nigeria",
    state: "Kogi",
    jurisdiction: "state",
    cities: ["Lokoja", "Okene", "Idah", "Kabba"]
  },
  {
    id: "benue-emergency",
    name: "Benue State Emergency Management Agency",
    type: "emergency",
    email: "sema-benue@example.gov.ng",
    country: "Nigeria",
    state: "Benue",
    jurisdiction: "state",
    cities: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala"]
  },
  {
    id: "nasarawa-emergency",
    name: "Nasarawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-nasarawa@example.gov.ng",
    country: "Nigeria",
    state: "Nasarawa",
    jurisdiction: "state",
    cities: ["Lafia", "Keffi", "Akwanga", "Nasarawa"]
  },
  {
    id: "plateau-emergency",
    name: "Plateau State Emergency Management Agency",
    type: "emergency",
    email: "sema-plateau@example.gov.ng",
    country: "Nigeria",
    state: "Plateau",
    jurisdiction: "state",
    cities: ["Jos", "Bukuru", "Pankshin", "Shendam"]
  },
  {
    id: "taraba-emergency",
    name: "Taraba State Emergency Management Agency",
    type: "emergency",
    email: "sema-taraba@example.gov.ng",
    country: "Nigeria",
    state: "Taraba",
    jurisdiction: "state",
    cities: ["Jalingo", "Wukari", "Bali", "Serti"]
  },
  {
    id: "adamawa-emergency",
    name: "Adamawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-adamawa@example.gov.ng",
    country: "Nigeria",
    state: "Adamawa",
    jurisdiction: "state",
    cities: ["Yola", "Mubi", "Numan", "Ganye"]
  },
  {
    id: "borno-emergency",
    name: "Borno State Emergency Management Agency",
    type: "emergency",
    email: "sema-borno@example.gov.ng",
    country: "Nigeria",
    state: "Borno",
    jurisdiction: "state",
    cities: ["Maiduguri", "Biu", "Bama", "Gwoza"]
  },
  {
    id: "yobe-emergency",
    name: "Yobe State Emergency Management Agency",
    type: "emergency",
    email: "sema-yobe@example.gov.ng",
    country: "Nigeria",
    state: "Yobe",
    jurisdiction: "state",
    cities: ["Damaturu", "Potiskum", "Gashua", "Nguru"]
  },
  {
    id: "bauchi-emergency",
    name: "Bauchi State Emergency Management Agency",
    type: "emergency",
    email: "sema-bauchi@example.gov.ng",
    country: "Nigeria",
    state: "Bauchi",
    jurisdiction: "state",
    cities: ["Bauchi", "Azare", "Misau", "Jama'are"]
  },
  {
    id: "gombe-emergency",
    name: "Gombe State Emergency Management Agency",
    type: "emergency",
    email: "sema-gombe@example.gov.ng",
    country: "Nigeria",
    state: "Gombe",
    jurisdiction: "state",
    cities: ["Gombe", "Billiri", "Kaltungo", "Dukku"]
  },
  {
    id: "kaduna-emergency",
    name: "Kaduna State Emergency Management Agency",
    type: "emergency",
    email: "sema-kaduna@example.gov.ng",
    country: "Nigeria",
    state: "Kaduna",
    jurisdiction: "state",
    cities: ["Kaduna", "Zaria", "Kafanchan", "Saminaka"]
  },
  {
    id: "kano-emergency",
    name: "Kano State Emergency Management Agency",
    type: "emergency",
    email: "sema-kano@example.gov.ng",
    country: "Nigeria",
    state: "Kano",
    jurisdiction: "state",
    cities: ["Kano", "Wudil", "Gaya", "Rano"]
  },
  {
    id: "katsina-emergency",
    name: "Katsina State Emergency Management Agency",
    type: "emergency",
    email: "sema-katsina@example.gov.ng",
    country: "Nigeria",
    state: "Katsina",
    jurisdiction: "state",
    cities: ["Katsina", "Daura", "Funtua", "Malumfashi"]
  },
  {
    id: "jigawa-emergency",
    name: "Jigawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-jigawa@example.gov.ng",
    country: "Nigeria",
    state: "Jigawa",
    jurisdiction: "state",
    cities: ["Dutse", "Hadejia", "Birnin Kudu", "Gumel"]
  },
  {
    id: "zamfara-emergency",
    name: "Zamfara State Emergency Management Agency",
    type: "emergency",
    email: "sema-zamfara@example.gov.ng",
    country: "Nigeria",
    state: "Zamfara",
    jurisdiction: "state",
    cities: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka"]
  },
  {
    id: "sokoto-emergency",
    name: "Sokoto State Emergency Management Agency",
    type: "emergency",
    email: "sema-sokoto@example.gov.ng",
    country: "Nigeria",
    state: "Sokoto",
    jurisdiction: "state",
    cities: ["Sokoto", "Tambuwal", "Gwadabawa", "Yabo"]
  },
  {
    id: "kebbi-emergency",
    name: "Kebbi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kebbi@example.gov.ng",
    country: "Nigeria",
    state: "Kebbi",
    jurisdiction: "state",
    cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru"]
  },
  {
    id: "niger-emergency",
    name: "Niger State Emergency Management Agency",
    type: "emergency",
    email: "sema-niger@example.gov.ng",
    country: "Nigeria",
    state: "Niger",
    jurisdiction: "state",
    cities: ["Minna", "Bida", "Kontagora", "Suleja"]
  },
  {
    id: "kwara-emergency",
    name: "Kwara State Emergency Management Agency",
    type: "emergency",
    email: "sema-kwara@example.gov.ng",
    country: "Nigeria",
    state: "Kwara",
    jurisdiction: "state",
    cities: ["Ilorin", "Offa", "Patigi", "Jebba"]
  },
  {
    id: "kogi-emergency",
    name: "Kogi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kogi@example.gov.ng",
    country: "Nigeria",
    state: "Kogi",
    jurisdiction: "state",
    cities: ["Lokoja", "Okene", "Idah", "Kabba"]
  },
  {
    id: "benue-emergency",
    name: "Benue State Emergency Management Agency",
    type: "emergency",
    email: "sema-benue@example.gov.ng",
    country: "Nigeria",
    state: "Benue",
    jurisdiction: "state",
    cities: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala"]
  },
  {
    id: "nasarawa-emergency",
    name: "Nasarawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-nasarawa@example.gov.ng",
    country: "Nigeria",
    state: "Nasarawa",
    jurisdiction: "state",
    cities: ["Lafia", "Keffi", "Akwanga", "Nasarawa"]
  },
  {
    id: "plateau-emergency",
    name: "Plateau State Emergency Management Agency",
    type: "emergency",
    email: "sema-plateau@example.gov.ng",
    country: "Nigeria",
    state: "Plateau",
    jurisdiction: "state",
    cities: ["Jos", "Bukuru", "Pankshin", "Shendam"]
  },
  {
    id: "taraba-emergency",
    name: "Taraba State Emergency Management Agency",
    type: "emergency",
    email: "sema-taraba@example.gov.ng",
    country: "Nigeria",
    state: "Taraba",
    jurisdiction: "state",
    cities: ["Jalingo", "Wukari", "Bali", "Serti"]
  },
  {
    id: "adamawa-emergency",
    name: "Adamawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-adamawa@example.gov.ng",
    country: "Nigeria",
    state: "Adamawa",
    jurisdiction: "state",
    cities: ["Yola", "Mubi", "Numan", "Ganye"]
  },
  {
    id: "borno-emergency",
    name: "Borno State Emergency Management Agency",
    type: "emergency",
    email: "sema-borno@example.gov.ng",
    country: "Nigeria",
    state: "Borno",
    jurisdiction: "state",
    cities: ["Maiduguri", "Biu", "Bama", "Gwoza"]
  },
  {
    id: "yobe-emergency",
    name: "Yobe State Emergency Management Agency",
    type: "emergency",
    email: "sema-yobe@example.gov.ng",
    country: "Nigeria",
    state: "Yobe",
    jurisdiction: "state",
    cities: ["Damaturu", "Potiskum", "Gashua", "Nguru"]
  },
  {
    id: "bauchi-emergency",
    name: "Bauchi State Emergency Management Agency",
    type: "emergency",
    email: "sema-bauchi@example.gov.ng",
    country: "Nigeria",
    state: "Bauchi",
    jurisdiction: "state",
    cities: ["Bauchi", "Azare", "Misau", "Jama'are"]
  },
  {
    id: "gombe-emergency",
    name: "Gombe State Emergency Management Agency",
    type: "emergency",
    email: "sema-gombe@example.gov.ng",
    country: "Nigeria",
    state: "Gombe",
    jurisdiction: "state",
    cities: ["Gombe", "Billiri", "Kaltungo", "Dukku"]
  },
  {
    id: "kaduna-emergency",
    name: "Kaduna State Emergency Management Agency",
    type: "emergency",
    email: "sema-kaduna@example.gov.ng",
    country: "Nigeria",
    state: "Kaduna",
    jurisdiction: "state",
    cities: ["Kaduna", "Zaria", "Kafanchan", "Saminaka"]
  },
  {
    id: "kano-emergency",
    name: "Kano State Emergency Management Agency",
    type: "emergency",
    email: "sema-kano@example.gov.ng",
    country: "Nigeria",
    state: "Kano",
    jurisdiction: "state",
    cities: ["Kano", "Wudil", "Gaya", "Rano"]
  },
  {
    id: "katsina-emergency",
    name: "Katsina State Emergency Management Agency",
    type: "emergency",
    email: "sema-katsina@example.gov.ng",
    country: "Nigeria",
    state: "Katsina",
    jurisdiction: "state",
    cities: ["Katsina", "Daura", "Funtua", "Malumfashi"]
  },
  {
    id: "jigawa-emergency",
    name: "Jigawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-jigawa@example.gov.ng",
    country: "Nigeria",
    state: "Jigawa",
    jurisdiction: "state",
    cities: ["Dutse", "Hadejia", "Birnin Kudu", "Gumel"]
  },
  {
    id: "zamfara-emergency",
    name: "Zamfara State Emergency Management Agency",
    type: "emergency",
    email: "sema-zamfara@example.gov.ng",
    country: "Nigeria",
    state: "Zamfara",
    jurisdiction: "state",
    cities: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka"]
  },
  {
    id: "sokoto-emergency",
    name: "Sokoto State Emergency Management Agency",
    type: "emergency",
    email: "sema-sokoto@example.gov.ng",
    country: "Nigeria",
    state: "Sokoto",
    jurisdiction: "state",
    cities: ["Sokoto", "Tambuwal", "Gwadabawa", "Yabo"]
  },
  {
    id: "kebbi-emergency",
    name: "Kebbi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kebbi@example.gov.ng",
    country: "Nigeria",
    state: "Kebbi",
    jurisdiction: "state",
    cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru"]
  },
  {
    id: "niger-emergency",
    name: "Niger State Emergency Management Agency",
    type: "emergency",
    email: "sema-niger@example.gov.ng",
    country: "Nigeria",
    state: "Niger",
    jurisdiction: "state",
    cities: ["Minna", "Bida", "Kontagora", "Suleja"]
  },
  {
    id: "kwara-emergency",
    name: "Kwara State Emergency Management Agency",
    type: "emergency",
    email: "sema-kwara@example.gov.ng",
    country: "Nigeria",
    state: "Kwara",
    jurisdiction: "state",
    cities: ["Ilorin", "Offa", "Patigi", "Jebba"]
  },
  {
    id: "kogi-emergency",
    name: "Kogi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kogi@example.gov.ng",
    country: "Nigeria",
    state: "Kogi",
    jurisdiction: "state",
    cities: ["Lokoja", "Okene", "Idah", "Kabba"]
  },
  {
    id: "benue-emergency",
    name: "Benue State Emergency Management Agency",
    type: "emergency",
    email: "sema-benue@example.gov.ng",
    country: "Nigeria",
    state: "Benue",
    jurisdiction: "state",
    cities: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala"]
  },
  {
    id: "nasarawa-emergency",
    name: "Nasarawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-nasarawa@example.gov.ng",
    country: "Nigeria",
    state: "Nasarawa",
    jurisdiction: "state",
    cities: ["Lafia", "Keffi", "Akwanga", "Nasarawa"]
  },
  {
    id: "plateau-emergency",
    name: "Plateau State Emergency Management Agency",
    type: "emergency",
    email: "sema-plateau@example.gov.ng",
    country: "Nigeria",
    state: "Plateau",
    jurisdiction: "state",
    cities: ["Jos", "Bukuru", "Pankshin", "Shendam"]
  },
  {
    id: "taraba-emergency",
    name: "Taraba State Emergency Management Agency",
    type: "emergency",
    email: "sema-taraba@example.gov.ng",
    country: "Nigeria",
    state: "Taraba",
    jurisdiction: "state",
    cities: ["Jalingo", "Wukari", "Bali", "Serti"]
  },
  {
    id: "adamawa-emergency",
    name: "Adamawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-adamawa@example.gov.ng",
    country: "Nigeria",
    state: "Adamawa",
    jurisdiction: "state",
    cities: ["Yola", "Mubi", "Numan", "Ganye"]
  },
  {
    id: "borno-emergency",
    name: "Borno State Emergency Management Agency",
    type: "emergency",
    email: "sema-borno@example.gov.ng",
    country: "Nigeria",
    state: "Borno",
    jurisdiction: "state",
    cities: ["Maiduguri", "Biu", "Bama", "Gwoza"]
  },
  {
    id: "yobe-emergency",
    name: "Yobe State Emergency Management Agency",
    type: "emergency",
    email: "sema-yobe@example.gov.ng",
    country: "Nigeria",
    state: "Yobe",
    jurisdiction: "state",
    cities: ["Damaturu", "Potiskum", "Gashua", "Nguru"]
  },
  {
    id: "bauchi-emergency",
    name: "Bauchi State Emergency Management Agency",
    type: "emergency",
    email: "sema-bauchi@example.gov.ng",
    country: "Nigeria",
    state: "Bauchi",
    jurisdiction: "state",
    cities: ["Bauchi", "Azare", "Misau", "Jama'are"]
  },
  {
    id: "gombe-emergency",
    name: "Gombe State Emergency Management Agency",
    type: "emergency",
    email: "sema-gombe@example.gov.ng",
    country: "Nigeria",
    state: "Gombe",
    jurisdiction: "state",
    cities: ["Gombe", "Billiri", "Kaltungo", "Dukku"]
  },
  {
    id: "kaduna-emergency",
    name: "Kaduna State Emergency Management Agency",
    type: "emergency",
    email: "sema-kaduna@example.gov.ng",
    country: "Nigeria",
    state: "Kaduna",
    jurisdiction: "state",
    cities: ["Kaduna", "Zaria", "Kafanchan", "Saminaka"]
  },
  {
    id: "kano-emergency",
    name: "Kano State Emergency Management Agency",
    type: "emergency",
    email: "sema-kano@example.gov.ng",
    country: "Nigeria",
    state: "Kano",
    jurisdiction: "state",
    cities: ["Kano", "Wudil", "Gaya", "Rano"]
  },
  {
    id: "katsina-emergency",
    name: "Katsina State Emergency Management Agency",
    type: "emergency",
    email: "sema-katsina@example.gov.ng",
    country: "Nigeria",
    state: "Katsina",
    jurisdiction: "state",
    cities: ["Katsina", "Daura", "Funtua", "Malumfashi"]
  },
  {
    id: "jigawa-emergency",
    name: "Jigawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-jigawa@example.gov.ng",
    country: "Nigeria",
    state: "Jigawa",
    jurisdiction: "state",
    cities: ["Dutse", "Hadejia", "Birnin Kudu", "Gumel"]
  },
  {
    id: "zamfara-emergency",
    name: "Zamfara State Emergency Management Agency",
    type: "emergency",
    email: "sema-zamfara@example.gov.ng",
    country: "Nigeria",
    state: "Zamfara",
    jurisdiction: "state",
    cities: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka"]
  },
  {
    id: "sokoto-emergency",
    name: "Sokoto State Emergency Management Agency",
    type: "emergency",
    email: "sema-sokoto@example.gov.ng",
    country: "Nigeria",
    state: "Sokoto",
    jurisdiction: "state",
    cities: ["Sokoto", "Tambuwal", "Gwadabawa", "Yabo"]
  },
  {
    id: "kebbi-emergency",
    name: "Kebbi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kebbi@example.gov.ng",
    country: "Nigeria",
    state: "Kebbi",
    jurisdiction: "state",
    cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru"]
  },
  {
    id: "niger-emergency",
    name: "Niger State Emergency Management Agency",
    type: "emergency",
    email: "sema-niger@example.gov.ng",
    country: "Nigeria",
    state: "Niger",
    jurisdiction: "state",
    cities: ["Minna", "Bida", "Kontagora", "Suleja"]
  },
  {
    id: "kwara-emergency",
    name: "Kwara State Emergency Management Agency",
    type: "emergency",
    email: "sema-kwara@example.gov.ng",
    country: "Nigeria",
    state: "Kwara",
    jurisdiction: "state",
    cities: ["Ilorin", "Offa", "Patigi", "Jebba"]
  },
  {
    id: "kogi-emergency",
    name: "Kogi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kogi@example.gov.ng",
    country: "Nigeria",
    state: "Kogi",
    jurisdiction: "state",
    cities: ["Lokoja", "Okene", "Idah", "Kabba"]
  },
  {
    id: "benue-emergency",
    name: "Benue State Emergency Management Agency",
    type: "emergency",
    email: "sema-benue@example.gov.ng",
    country: "Nigeria",
    state: "Benue",
    jurisdiction: "state",
    cities: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala"]
  },
  {
    id: "nasarawa-emergency",
    name: "Nasarawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-nasarawa@example.gov.ng",
    country: "Nigeria",
    state: "Nasarawa",
    jurisdiction: "state",
    cities: ["Lafia", "Keffi", "Akwanga", "Nasarawa"]
  },
  {
    id: "plateau-emergency",
    name: "Plateau State Emergency Management Agency",
    type: "emergency",
    email: "sema-plateau@example.gov.ng",
    country: "Nigeria",
    state: "Plateau",
    jurisdiction: "state",
    cities: ["Jos", "Bukuru", "Pankshin", "Shendam"]
  },
  {
    id: "taraba-emergency",
    name: "Taraba State Emergency Management Agency",
    type: "emergency",
    email: "sema-taraba@example.gov.ng",
    country: "Nigeria",
    state: "Taraba",
    jurisdiction: "state",
    cities: ["Jalingo", "Wukari", "Bali", "Serti"]
  },
  {
    id: "adamawa-emergency",
    name: "Adamawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-adamawa@example.gov.ng",
    country: "Nigeria",
    state: "Adamawa",
    jurisdiction: "state",
    cities: ["Yola", "Mubi", "Numan", "Ganye"]
  },
  {
    id: "borno-emergency",
    name: "Borno State Emergency Management Agency",
    type: "emergency",
    email: "sema-borno@example.gov.ng",
    country: "Nigeria",
    state: "Borno",
    jurisdiction: "state",
    cities: ["Maiduguri", "Biu", "Bama", "Gwoza"]
  },
  {
    id: "yobe-emergency",
    name: "Yobe State Emergency Management Agency",
    type: "emergency",
    email: "sema-yobe@example.gov.ng",
    country: "Nigeria",
    state: "Yobe",
    jurisdiction: "state",
    cities: ["Damaturu", "Potiskum", "Gashua", "Nguru"]
  },
  {
    id: "bauchi-emergency",
    name: "Bauchi State Emergency Management Agency",
    type: "emergency",
    email: "sema-bauchi@example.gov.ng",
    country: "Nigeria",
    state: "Bauchi",
    jurisdiction: "state",
    cities: ["Bauchi", "Azare", "Misau", "Jama'are"]
  },
  {
    id: "gombe-emergency",
    name: "Gombe State Emergency Management Agency",
    type: "emergency",
    email: "sema-gombe@example.gov.ng",
    country: "Nigeria",
    state: "Gombe",
    jurisdiction: "state",
    cities: ["Gombe", "Billiri", "Kaltungo", "Dukku"]
  },
  {
    id: "kaduna-emergency",
    name: "Kaduna State Emergency Management Agency",
    type: "emergency",
    email: "sema-kaduna@example.gov.ng",
    country: "Nigeria",
    state: "Kaduna",
    jurisdiction: "state",
    cities: ["Kaduna", "Zaria", "Kafanchan", "Saminaka"]
  },
  {
    id: "kano-emergency",
    name: "Kano State Emergency Management Agency",
    type: "emergency",
    email: "sema-kano@example.gov.ng",
    country: "Nigeria",
    state: "Kano",
    jurisdiction: "state",
    cities: ["Kano", "Wudil", "Gaya", "Rano"]
  },
  {
    id: "katsina-emergency",
    name: "Katsina State Emergency Management Agency",
    type: "emergency",
    email: "sema-katsina@example.gov.ng",
    country: "Nigeria",
    state: "Katsina",
    jurisdiction: "state",
    cities: ["Katsina", "Daura", "Funtua", "Malumfashi"]
  },
  {
    id: "jigawa-emergency",
    name: "Jigawa State Emergency Management Agency",
    type: "emergency",
    email: "sema-jigawa@example.gov.ng",
    country: "Nigeria",
    state: "Jigawa",
    jurisdiction: "state",
    cities: ["Dutse", "Hadejia", "Birnin Kudu", "Gumel"]
  },
  {
    id: "zamfara-emergency",
    name: "Zamfara State Emergency Management Agency",
    type: "emergency",
    email: "sema-zamfara@example.gov.ng",
    country: "Nigeria",
    state: "Zamfara",
    jurisdiction: "state",
    cities: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka"]
  },
  {
    id: "sokoto-emergency",
    name: "Sokoto State Emergency Management Agency",
    type: "emergency",
    email: "sema-sokoto@example.gov.ng",
    country: "Nigeria",
    state: "Sokoto",
    jurisdiction: "state",
    cities: ["Sokoto", "Tambuwal", "Gwadabawa", "Yabo"]
  },
  {
    id: "kebbi-emergency",
    name: "Kebbi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kebbi@example.gov.ng",
    country: "Nigeria",
    state: "Kebbi",
    jurisdiction: "state",
    cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru"]
  },
  {
    id: "niger-emergency",
    name: "Niger State Emergency Management Agency",
    type: "emergency",
    email: "sema-niger@example.gov.ng",
    country: "Nigeria",
    state: "Niger",
    jurisdiction: "state",
    cities: ["Minna", "Bida", "Kontagora", "Suleja"]
  },
  {
    id: "kwara-emergency",
    name: "Kwara State Emergency Management Agency",
    type: "emergency",
    email: "sema-kwara@example.gov.ng",
    country: "Nigeria",
    state: "Kwara",
    jurisdiction: "state",
    cities: ["Ilorin", "Offa", "Patigi", "Jebba"]
  },
  {
    id: "kogi-emergency",
    name: "Kogi State Emergency Management Agency",
    type: "emergency",
    email: "sema-kogi@example.gov.ng",
    country: "Nigeria",
    state: "Kogi",
    jurisdiction: "state",
    cities: ["Lokoja", "Okene", "Idah", "Kabba"]
  },
  {
    id: "benue-emergency",
    name: "Benue State Emergency Management Agency",
    type: "emergency",
    email: "sema-benue@example.gov.ng",
    country: "Nigeria",
    state: "Benue",
    jurisdiction: "state",
    cities: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala"]
  }
];

// Function to find agencies based on location and event type
export function findAgenciesForLocation(country, state, city, eventType) {
  if (!country || !state || !city) {
    console.log("⚠️ Incomplete location data, falling back to national agencies");
    return agencies.filter(a => a.jurisdiction === "national");
  }

  // First try to find exact city match
  let matchedAgencies = agencies.filter(agency => {
    // National agencies always match
    if (agency.jurisdiction === "national") return true;
    
    // Check if agency covers this state
    if (agency.state?.toLowerCase() === state.toLowerCase()) {
      // If agency has specific cities, check if city is included
      if (agency.cities && agency.cities.length > 0) {
        return agency.cities.some(c => c.toLowerCase() === city.toLowerCase());
      }
      // If no city list, agency covers entire state
      return true;
    }
    return false;
  });

  // Filter by event type if specified (fire, flood, etc.)
  if (eventType) {
    const typeMap = {
      'Fire': 'fire',
      'Flood': 'emergency',
      'Drought': 'emergency',
      'Pollution': 'environment',
      'Storm': 'emergency',
      'Other': 'emergency'
    };
    
    const requiredType = typeMap[eventType] || 'emergency';
    matchedAgencies = matchedAgencies.filter(a => a.type === requiredType || a.type === 'emergency');
  }

  return matchedAgencies.length > 0 ? matchedAgencies : agencies.filter(a => a.jurisdiction === "national");
}