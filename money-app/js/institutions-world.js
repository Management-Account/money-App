// Banks, wallets and brokers for the countries in the "New account" picker (Egypt lives in institutions.js).
// Compiled from general knowledge of the largest, best-known providers in each country (not from a regulator's
// register): check the names you care about, and add or fix entries by editing this file.
// Entry format: "Name|BADGE|extra search words" (badge and words optional). The id is made from the country code and
// the name, so do not rename an entry once people may have picked it; add a new one instead.

export const COUNTRIES = [
  ['EG', 'Egypt', '🇪🇬'], ['US', 'United States', '🇺🇸'], ['CN', 'China', '🇨🇳'], ['DE', 'Germany', '🇩🇪'], ['JP', 'Japan', '🇯🇵'],
  ['IN', 'India', '🇮🇳'], ['GB', 'United Kingdom', '🇬🇧'], ['FR', 'France', '🇫🇷'], ['IT', 'Italy', '🇮🇹'], ['CA', 'Canada', '🇨🇦'],
  ['BR', 'Brazil', '🇧🇷'], ['RU', 'Russia', '🇷🇺'], ['KR', 'South Korea', '🇰🇷'], ['AU', 'Australia', '🇦🇺'], ['MX', 'Mexico', '🇲🇽'],
  ['ES', 'Spain', '🇪🇸'], ['ID', 'Indonesia', '🇮🇩'], ['NL', 'Netherlands', '🇳🇱'], ['TR', 'Türkiye (Turkey)', '🇹🇷'], ['SA', 'Saudi Arabia', '🇸🇦'],
  ['CH', 'Switzerland', '🇨🇭'], ['AE', 'United Arab Emirates', '🇦🇪'],
];

// country -> { bank: [...], wallet: [...], card: [...] }
export const WORLD = {
  US: {
    bank: ['JPMorgan Chase|CHASE|jpm', 'Bank of America|BofA', 'Wells Fargo|WF', 'Citibank|CITI|citi', 'U.S. Bank|USB|us bank', 'PNC Bank|PNC', 'Truist|TRU', 'Capital One|C1', 'TD Bank|TD', 'Goldman Sachs Marcus|GS|marcus', 'Ally Bank|ALLY', 'Charles Schwab Bank|CS|schwab', 'Discover Bank|DISC', 'Chime|CHM', 'SoFi|SOFI'],
    wallet: ['Venmo|VEN', 'Cash App|CASH|square', 'Zelle|ZEL', 'Apple Cash|AC'],
  },
  CN: {
    bank: ['Industrial and Commercial Bank of China|ICBC', 'China Construction Bank|CCB', 'Agricultural Bank of China|ABC', 'Bank of China|BOC', 'Bank of Communications|BCM', 'China Merchants Bank|CMB', 'Postal Savings Bank of China|PSBC', 'Ping An Bank|PAB'],
    wallet: ['Alipay|ALI|ant', 'WeChat Pay|WCP|weixin tencent'],
    card: ['UnionPay (China)|UP|yinlian'],
  },
  DE: {
    bank: ['Deutsche Bank|DB', 'Commerzbank|CBK', 'DKB|DKB|deutsche kreditbank', 'ING Germany|ING|ing-diba', 'Sparkasse|SPK', 'Volksbanken Raiffeisenbanken|VR', 'Postbank|PB', 'N26|N26', 'Comdirect|CDI', 'HypoVereinsbank|HVB|unicredit'],
    wallet: ['Klarna|KLA'],
  },
  JP: {
    bank: ['MUFG Bank|MUFG|mitsubishi', 'Sumitomo Mitsui Banking|SMBC', 'Mizuho Bank|MZH', 'Resona Bank|RSN', 'Japan Post Bank|JPB|yucho', 'Rakuten Bank|RKT', 'SBI Shinsei Bank|SBI', 'Sony Bank|SNY'],
    wallet: ['PayPay|PP', 'Rakuten Pay|RP', 'd Payment|dP|docomo', 'Merpay|MP|mercari', 'Suica|SU'],
  },
  IN: {
    bank: ['State Bank of India|SBI', 'HDFC Bank|HDFC', 'ICICI Bank|ICICI', 'Axis Bank|AXIS', 'Kotak Mahindra Bank|KMB|kotak', 'Punjab National Bank|PNB', 'Bank of Baroda|BOB', 'Canara Bank|CAN', 'IndusInd Bank|IIB', 'Yes Bank|YES'],
    wallet: ['Paytm|PTM', 'PhonePe|PE', 'Amazon Pay|AMZ', 'BHIM UPI|BHIM|upi', 'MobiKwik|MK', 'Freecharge|FC'],
  },
  GB: {
    bank: ['Barclays|BARC', 'HSBC UK|HSBC', 'Lloyds Bank|LLOY', 'NatWest|NW|national westminster', 'Santander UK|SAN', 'Nationwide Building Society|NBS', 'Halifax|HLX', 'TSB|TSB', 'Monzo|MNZ', 'Starling Bank|STAR', 'First Direct|FD', 'Metro Bank|METRO'],
    wallet: [],
  },
  FR: {
    bank: ['BNP Paribas|BNP', 'Crédit Agricole|CA|credit agricole', 'Société Générale|SG|societe generale', 'Banque Populaire|BP|bpce', 'Caisse d’Epargne|CE|bpce', 'Crédit Mutuel|CM', 'La Banque Postale|LBP', 'LCL|LCL', 'Boursorama Banque|BOU', 'Hello bank!|HB'],
    wallet: ['Lydia (Sumeria)|LYD|sumeria'],
  },
  IT: {
    bank: ['Intesa Sanpaolo|ISP', 'UniCredit|UCG', 'Banco BPM|BPM', 'Monte dei Paschi di Siena|MPS', 'BPER Banca|BPER', 'BancoPosta (Poste Italiane)|BP|poste', 'Fineco|FNC', 'Banca Mediolanum|MED'],
    wallet: ['Satispay|SAT', 'Postepay|PP|poste'],
  },
  CA: {
    bank: ['Royal Bank of Canada (RBC)|RBC', 'TD Canada Trust|TD', 'Scotiabank|BNS', 'BMO Bank of Montreal|BMO', 'CIBC|CIBC', 'National Bank of Canada|NBC', 'Desjardins|DJ', 'Tangerine|TNG', 'EQ Bank|EQ'],
    wallet: ['Interac e-Transfer|INT|interac', 'Wealthsimple Cash|WS'],
  },
  BR: {
    bank: ['Itaú Unibanco|ITAU|itau', 'Banco do Brasil|BB', 'Bradesco|BRAD', 'Caixa Econômica Federal|CEF|caixa', 'Santander Brasil|SAN', 'BTG Pactual|BTG', 'Nubank|NU|nu pagamentos', 'Banco Inter|INTER', 'C6 Bank|C6', 'Banrisul|BNRS'],
    wallet: ['PicPay|PIC', 'Mercado Pago|MP', 'PagBank|PAG|pagseguro'],
  },
  RU: {
    bank: ['Sberbank|SBER|sber', 'VTB Bank|VTB', 'Gazprombank|GPB', 'Alfa-Bank|ALFA', 'T-Bank (Tinkoff)|T|tinkoff', 'Raiffeisenbank Russia|RBRU', 'Rosselkhozbank|RSHB'],
    wallet: ['YooMoney|YM|yandex money'],
    card: ['Mir card|MIR'],
  },
  KR: {
    bank: ['KB Kookmin Bank|KB|kookmin', 'Shinhan Bank|SH', 'Hana Bank|HANA', 'Woori Bank|WOORI', 'NH NongHyup Bank|NH|nonghyup', 'IBK Industrial Bank of Korea|IBK', 'KakaoBank|KKO|kakao', 'Toss Bank|TOSS', 'K Bank|KB2|kbank'],
    wallet: ['KakaoPay|KKP', 'Naver Pay|NP', 'Toss|TOSS'],
  },
  AU: {
    bank: ['Commonwealth Bank|CBA|commbank', 'Westpac|WBC', 'ANZ|ANZ', 'NAB|NAB|national australia bank', 'Macquarie Bank|MQG', 'ING Australia|ING', 'Bendigo Bank|BEN', 'Bank of Queensland|BOQ', 'Up|UP'],
    wallet: ['Afterpay|AFT', 'Zip|ZIP|zippay'],
  },
  MX: {
    bank: ['BBVA México|BBVA|bancomer', 'Banorte|BNRT', 'Santander México|SAN', 'Citibanamex|BNMX|banamex', 'HSBC México|HSBC', 'Scotiabank México|BNS', 'Inbursa|INB', 'Banco Azteca|AZT', 'Nu México|NU|nubank', 'Hey Banco|HEY'],
    wallet: ['Mercado Pago|MP', 'Klar|KLR'],
  },
  ES: {
    bank: ['Banco Santander|SAN', 'BBVA|BBVA', 'CaixaBank|CAIX|la caixa', 'Banco Sabadell|SAB', 'Bankinter|BKT', 'Unicaja Banco|UNI', 'Kutxabank|KTX', 'Abanca|ABA', 'ING España|ING', 'Openbank|OPEN'],
    wallet: ['Bizum|BIZ'],
  },
  ID: {
    bank: ['Bank Central Asia (BCA)|BCA', 'Bank Mandiri|MDR', 'Bank Rakyat Indonesia (BRI)|BRI', 'Bank Negara Indonesia (BNI)|BNI', 'CIMB Niaga|CIMB', 'Bank Danamon|DNM', 'Bank Permata|PMT', 'Jenius (BTPN)|JEN|btpn', 'SeaBank|SEA', 'Bank Jago|JAGO'],
    wallet: ['GoPay|GP|gojek', 'OVO|OVO', 'DANA|DANA', 'ShopeePay|SP|shopee', 'LinkAja|LA'],
  },
  NL: {
    bank: ['ING Nederland|ING', 'Rabobank|RABO', 'ABN AMRO|ABN', 'de Volksbank (SNS)|SNS|asn regiobank', 'ASN Bank|ASN', 'bunq|BUNQ', 'Knab|KNAB', 'Triodos Bank|TRI'],
    wallet: ['Tikkie|TIK|abn amro'],
  },
  TR: {
    bank: ['Ziraat Bankası|ZRT|ziraat', 'Türkiye İş Bankası|İŞ|is bank isbank', 'Garanti BBVA|GAR', 'Akbank|AKB', 'Yapı Kredi|YKB|yapi kredi', 'Halkbank|HLK', 'VakıfBank|VKF|vakifbank', 'QNB Türkiye|QNB|finansbank', 'DenizBank|DNZ', 'Enpara|ENP'],
    wallet: ['Papara|PAP', 'Tosla|TSL', 'Paycell|PAY', 'ininal|ININ'],
  },
  SA: {
    bank: ['Saudi National Bank (SNB)|SNB|alahli ncb', 'Al Rajhi Bank|RJHI|rajhi', 'Riyad Bank|RIYD', 'Saudi Awwal Bank (SAB)|SAB|sabb', 'Banque Saudi Fransi|BSF', 'Alinma Bank|ALN', 'Arab National Bank|ANB', 'Bank Albilad|BLD', 'Bank AlJazira|BJZ', 'Saudi Investment Bank|SAIB'],
    wallet: ['stc pay|STC|stc bank', 'UrPay|URP', 'Barq|BARQ'],
    card: ['mada card|MADA'],
  },
  CH: {
    bank: ['UBS|UBS', 'PostFinance|PF', 'Zürcher Kantonalbank|ZKB|zurich', 'Raiffeisen Switzerland|RAIF', 'Migros Bank|MIG', 'Banque Cantonale Vaudoise|BCV', 'Basler Kantonalbank|BKB', 'Neon|NEON', 'Yuh|YUH'],
    wallet: ['TWINT|TWI'],
  },
  AE: {
    bank: ['Emirates NBD|ENBD', 'First Abu Dhabi Bank (FAB)|FAB', 'Abu Dhabi Commercial Bank (ADCB)|ADCB', 'Dubai Islamic Bank|DIB', 'Mashreq Bank|MSQ', 'RAKBANK|RAK', 'Emirates Islamic|EI', 'Commercial Bank of Dubai|CBD', 'Abu Dhabi Islamic Bank (ADIB)|ADIB', 'Wio Bank|WIO'],
    wallet: ['Careem Pay|CRM', 'e& money|e&|etisalat', 'Payit|PYT'],
  },
};

// Worldwide providers, shown under every country (wallets and cards) or under "Investments".
export const GLOBAL = {
  wallet: ['Revolut|REV', 'Wise|WISE|transferwise', 'Payoneer|PAYO', 'Skrill|SKR', 'Neteller|NET'],
  invest: ['Interactive Brokers|IBKR', 'Fidelity|FID', 'Vanguard|VG', 'Charles Schwab|CS|schwab', 'Robinhood|RH', 'eToro|ETO', 'Trading 212|T212', 'Binance|BNB', 'Coinbase|CB', 'Crypto wallet|CRY|bitcoin ethereum'],
};
