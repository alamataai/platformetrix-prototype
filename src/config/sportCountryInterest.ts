import type { SportInterestEntry } from '../types'

// Maps CSV header country names → ISO-3166 alpha-2 codes.
// The CSV uses "UK" / "USA" / short names that differ from countries.json display names.
const CSV_NAME_TO_ISO: Record<string, string> = {
  'Argentina': 'AR', 'Australia': 'AU', 'Austria': 'AT', 'Belgium': 'BE',
  'Brazil': 'BR', 'Bulgaria': 'BG', 'Canada': 'CA', 'Chile': 'CL',
  'China': 'CN', 'Colombia': 'CO', 'Croatia': 'HR', 'Czech Republic': 'CZ',
  'Denmark': 'DK', 'Egypt': 'EG', 'France': 'FR', 'Germany': 'DE',
  'Ghana': 'GH', 'Greece': 'GR', 'Hong Kong': 'HK', 'Hungary': 'HU',
  'India': 'IN', 'Indonesia': 'ID', 'Ireland': 'IE', 'Israel': 'IL',
  'Italy': 'IT', 'Japan': 'JP', 'Kenya': 'KE', 'Malaysia': 'MY',
  'Mexico': 'MX', 'Morocco': 'MA', 'Netherlands': 'NL', 'New Zealand': 'NZ',
  'Nigeria': 'NG', 'Norway': 'NO', 'Philippines': 'PH', 'Poland': 'PL',
  'Portugal': 'PT', 'Romania': 'RO', 'Saudi Arabia': 'SA', 'Serbia': 'RS',
  'Singapore': 'SG', 'South Africa': 'ZA', 'South Korea': 'KR', 'Spain': 'ES',
  'Sweden': 'SE', 'Switzerland': 'CH', 'Taiwan': 'TW', 'Thailand': 'TH',
  'Turkey': 'TR', 'UAE': 'AE', 'UK': 'GB', 'USA': 'US', 'Vietnam': 'VN',
}

// Embedded CSV — same data as public/sport_per_country_interest.csv.
// Embedded here for synchronous access without a runtime fetch.
// First row: header (blank label, then country names). Subsequent rows: sport label, then scores.
const RAW = `,Argentina,Australia,Austria,Belgium,Brazil,Bulgaria,Canada,Chile,China,Colombia,Croatia,Czech Republic,Denmark,Egypt,France,Germany,Ghana,Greece,Hong Kong,Hungary,India,Indonesia,Ireland,Israel,Italy,Japan,Kenya,Malaysia,Mexico,Morocco,Netherlands,New Zealand,Nigeria,Norway,Philippines,Poland,Portugal,Romania,Saudi Arabia,Serbia,Singapore,South Africa,South Korea,Spain,Sweden,Switzerland,Taiwan,Thailand,Turkey,UAE,UK,USA,Vietnam
American football,0.109,0.167,0.13,0.066,0.21,0.058,0.331,0.146,0.094,0.138,0.066,0.083,0.107,0.302,0.078,0.138,0.019,0.062,0.113,0.105,0.198,0.131,0.153,0.077,0.065,0.037,0.145,0.144,0.446,0.039,0.096,0.144,0.113,0.099,0.147,0.071,0.084,0.093,0.234,0.089,0.104,0.186,0.063,0.076,0.091,0.098,0.084,0.176,0.096,0.246,0.135,0.637,0.146
Athletics,0.136,0.177,0.155,0.254,0.236,0.252,0.159,0.226,0.181,0.208,0.277,0.299,0.2,0.175,0.239,0.245,0.175,0.333,0.172,0.21,0.206,0.159,0.27,0.22,0.307,0.184,0.415,0.273,0.2,0.278,0.201,0.17,0.176,0.289,0.24,0.305,0.21,0.213,0.191,0.368,0.142,0.391,0.134,0.221,0.382,0.253,0.126,0.163,0.251,0.25,0.269,0.166,0.236
Australian rules football (Australia and New Zealand Only),0,0.406,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.031,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
Badminton,0.014,0.052,0.041,0.051,0.02,0.04,0.064,0.026,0.293,0.021,0.038,0.048,0.174,0.01,0.052,0.039,0.003,0.019,0.284,0.05,0.289,0.531,0.058,0.022,0.01,0.051,0.052,0.6,0.026,0.004,0.057,0.072,0.022,0.049,0.319,0.047,0.039,0.049,0.075,0.03,0.299,0.011,0.092,0.028,0.049,0.047,0.26,0.256,0.053,0.191,0.049,0.033,0.36
Baseball,0.043,0.082,0.033,0.032,0.071,0.028,0.316,0.108,0.058,0.16,0.038,0.047,0.024,0.038,0.041,0.039,0.012,0.027,0.082,0.039,0.088,0.083,0.054,0.042,0.049,0.415,0.058,0.063,0.348,0.008,0.061,0.076,0.04,0.049,0.165,0.037,0.035,0.054,0.075,0.023,0.081,0.07,0.449,0.054,0.04,0.05,0.451,0.066,0.048,0.1,0.051,0.413,0.092
Basketball,0.35,0.295,0.142,0.222,0.444,0.259,0.349,0.392,0.464,0.397,0.332,0.194,0.141,0.237,0.246,0.221,0.085,0.677,0.331,0.243,0.325,0.429,0.214,0.381,0.269,0.127,0.319,0.293,0.435,0.141,0.191,0.292,0.227,0.176,0.795,0.302,0.292,0.251,0.325,0.678,0.31,0.358,0.223,0.393,0.158,0.198,0.429,0.301,0.595,0.461,0.161,0.491,0.355
Boxing,0.305,0.186,0.111,0.11,0.283,0.221,0.168,0.277,0.127,0.246,0.196,0.11,0.133,0.183,0.146,0.155,0.159,0.128,0.102,0.162,0.215,0.221,0.271,0.092,0.096,0.099,0.194,0.192,0.507,0.138,0.178,0.252,0.158,0.132,0.444,0.205,0.13,0.208,0.248,0.164,0.14,0.316,0.083,0.149,0.111,0.132,0.097,0.342,0.249,0.324,0.222,0.234,0.23
Cricket,0.003,0.306,0.008,0.008,0.006,0.007,0.042,0.007,0.021,0.005,0.003,0.008,0.017,0.01,0.008,0.009,0.001,0.01,0.028,0.01,0.668,0.007,0.077,0.009,0.007,0.003,0.019,0.029,0.009,0.002,0.014,0.251,0.019,0.022,0.008,0.011,0.007,0.011,0.134,0.006,0.039,0.402,0.006,0.006,0.015,0.015,0.013,0.017,0.011,0.43,0.205,0.023,0.018
Cycling,0.132,0.149,0.208,0.408,0.185,0.126,0.133,0.212,0.175,0.53,0.121,0.267,0.408,0.144,0.323,0.191,0.096,0.124,0.197,0.216,0.278,0.32,0.174,0.113,0.314,0.043,0.143,0.275,0.171,0.27,0.285,0.124,0.072,0.231,0.18,0.197,0.283,0.226,0.179,0.15,0.187,0.179,0.04,0.346,0.132,0.264,0.169,0.175,0.278,0.273,0.18,0.108,0.374
Field hockey,0.053,0.024,0.009,0.048,0.007,0.006,0.02,0.013,0.018,0.006,0.004,0.031,0.022,0.005,0.007,0.017,0.001,0.006,0.028,0.009,0.046,0.007,0.02,0.008,0.006,0.003,0.023,0.137,0.009,0.002,0.076,0.035,0.009,0.014,0.007,0.013,0.018,0.012,0.016,0.005,0.021,0.028,0.005,0.009,0.015,0.013,0.01,0.019,0.009,0.028,0.017,0.013,0.021
Gaelic football (Ireland Only),0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.371,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
Gaelic hurling  (Ireland Only),0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.266,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
Golf,0.071,0.157,0.098,0.073,0.088,0.072,0.202,0.104,0.135,0.092,0.038,0.089,0.113,0.093,0.083,0.08,0.026,0.059,0.138,0.064,0.153,0.101,0.305,0.055,0.066,0.115,0.096,0.124,0.11,0.038,0.102,0.145,0.078,0.132,0.099,0.092,0.072,0.085,0.155,0.045,0.146,0.202,0.162,0.092,0.159,0.112,0.108,0.169,0.117,0.202,0.224,0.218,0.177
Gymnastics,0.143,0.128,0.091,0.136,0.294,0.2,0.14,0.235,0.117,0.208,0.149,0.099,0.094,0.066,0.118,0.087,0.125,0.185,0.175,0.064,0.118,0.206,0.135,0.15,0.188,0.056,0.134,0.164,0.232,0.036,0.092,0.129,0.23,0.056,0.194,0.115,0.171,0.308,0.077,0.203,0.108,0.176,0.053,0.166,0.098,0.127,0.134,0.106,0.139,0.132,0.137,0.204,0.094
Handball (Select Markets Only),0,0,0.105,0.036,0.061,0.034,0,0,0,0,0.513,0.094,0.447,0.192,0.164,0.233,0,0.048,0,0.253,0,0,0,0.04,0.039,0,0,0,0,0,0.076,0,0,0.339,0,0.222,0.138,0.253,0,0.147,0,0,0,0.105,0.25,0.088,0,0,0.065,0,0,0,0
Horse-racing / equestrian events,0.031,0.106,0.042,0.049,0.013,0.043,0.061,0.062,0.048,0.047,0.019,0.084,0.044,0.062,0.057,0.051,0.023,0.036,0.061,0.052,0.064,0.032,0.137,0.049,0.035,0.059,0.038,0.051,0.062,0.098,0.052,0.08,0.028,0.044,0.054,0.043,0.034,0.059,0.129,0.042,0.039,0.072,0.015,0.032,0.096,0.056,0.039,0.033,0.089,0.118,0.095,0.085,0.041
Ice hockey,0.038,0.069,0.152,0.038,0.051,0.053,0.502,0.059,0.05,0.044,0.067,0.549,0.098,0.032,0.047,0.133,0.005,0.032,0.066,0.08,0.068,0.026,0.054,0.042,0.035,0.013,0.034,0.049,0.071,0.008,0.064,0.065,0.022,0.123,0.047,0.088,0.051,0.073,0.057,0.041,0.051,0.048,0.026,0.03,0.374,0.277,0.033,0.055,0.062,0.07,0.051,0.211,0.065
Long-distance running (e.g. marathons),0.052,0.056,0.054,0.054,0.113,0.042,0.05,0.078,0.092,0.06,0.038,0.037,0.032,0.063,0.058,0.052,0.129,0.093,0.081,0.032,0.088,0.089,0.075,0.048,0.047,0.106,0.183,0.096,0.079,0.043,0.053,0.062,0.087,0.055,0.092,0.045,0.063,0.056,0.085,0.052,0.062,0.18,0.054,0.048,0.057,0.061,0.059,0.064,0.081,0.101,0.071,0.056,0.071
Martial arts,0.212,0.192,0.097,0.095,0.358,0.118,0.179,0.279,0.121,0.211,0.235,0.147,0.109,0.129,0.118,0.1,0.044,0.162,0.113,0.137,0.202,0.298,0.187,0.115,0.093,0.063,0.171,0.283,0.299,0.063,0.194,0.261,0.095,0.144,0.4,0.191,0.154,0.154,0.187,0.178,0.175,0.283,0.176,0.144,0.127,0.119,0.108,0.238,0.229,0.285,0.122,0.226,0.238
Motor sports (e.g. Formula 1),0.436,0.32,0.372,0.256,0.461,0.293,0.241,0.311,0.243,0.33,0.285,0.274,0.227,0.167,0.264,0.279,0.049,0.367,0.248,0.36,0.305,0.578,0.301,0.144,0.426,0.109,0.307,0.382,0.39,0.097,0.39,0.282,0.147,0.242,0.301,0.245,0.383,0.311,0.405,0.26,0.33,0.433,0.133,0.416,0.228,0.32,0.212,0.293,0.375,0.43,0.327,0.264,0.307
Netball,0.004,0.078,0.008,0.006,0.005,0.006,0.009,0.006,0.016,0.006,0.002,0.007,0.01,0.014,0.006,0.008,0.028,0.004,0.025,0.005,0.025,0.011,0.013,0.018,0.005,0.003,0.077,0.071,0.006,0.01,0.01,0.144,0.018,0.014,0.005,0.01,0.005,0.008,0.023,0.002,0.034,0.149,0.005,0.005,0.007,0.01,0.034,0.02,0.007,0.03,0.029,0.008,0.022
Polo (equestrian sport),0.014,0.011,0.009,0.013,0.009,0.008,0.008,0.013,0.017,0.009,0.004,0.009,0.009,0.009,0.009,0.012,0.002,0.018,0.021,0.013,0.014,0.016,0.011,0.007,0.005,0.003,0.004,0.017,0.01,0.007,0.017,0.011,0.008,0.011,0.008,0.01,0.006,0.009,0.015,0.004,0.009,0.007,0.004,0.005,0.012,0.013,0.012,0.012,0.014,0.016,0.008,0.008,0.017
Rowing,0.023,0.033,0.027,0.021,0.033,0.04,0.033,0.041,0.03,0.016,0.069,0.042,0.032,0.023,0.024,0.042,0.032,0.053,0.041,0.068,0.036,0.028,0.046,0.023,0.036,0.008,0.016,0.029,0.024,0.008,0.038,0.062,0.01,0.03,0.018,0.038,0.026,0.102,0.03,0.042,0.027,0.02,0.01,0.027,0.018,0.031,0.026,0.038,0.035,0.034,0.038,0.024,0.064
Rugby,0.173,0.267,0.036,0.06,0.034,0.028,0.059,0.089,0.062,0.042,0.021,0.06,0.029,0.022,0.348,0.034,0.006,0.02,0.067,0.024,0.06,0.02,0.508,0.024,0.135,0.099,0.175,0.082,0.041,0.01,0.063,0.543,0.019,0.033,0.045,0.036,0.062,0.083,0.047,0.031,0.061,0.658,0.014,0.058,0.03,0.078,0.038,0.04,0.03,0.08,0.308,0.045,0.067
Sailing,0.015,0.036,0.05,0.025,0.017,0.017,0.037,0.026,0.033,0.012,0.028,0.021,0.043,0.021,0.048,0.035,0.015,0.056,0.037,0.03,0.04,0.027,0.032,0.035,0.065,0.006,0.023,0.036,0.015,0.008,0.045,0.09,0.02,0.035,0.029,0.035,0.022,0.024,0.036,0.026,0.033,0.028,0.012,0.028,0.037,0.06,0.021,0.028,0.047,0.05,0.03,0.035,0.041
Skateboarding,0.036,0.065,0.035,0.026,0.094,0.022,0.055,0.057,0.052,0.039,0.023,0.042,0.031,0.047,0.033,0.028,0.027,0.03,0.058,0.027,0.06,0.015,0.04,0.025,0.023,0.022,0.041,0.051,0.054,0.037,0.047,0.078,0.03,0.023,0.105,0.027,0.053,0.026,0.085,0.018,0.049,0.073,0.028,0.026,0.031,0.037,0.04,0.048,0.051,0.081,0.035,0.075,0.072
Soccer,0.862,0.516,0.634,0.606,0.876,0.63,0.489,0.778,0.572,0.819,0.765,0.535,0.611,0.834,0.599,0.684,0.541,0.77,0.583,0.559,0.639,0.849,0.703,0.529,0.726,0.341,0.824,0.718,0.792,0.916,0.683,0.462,0.622,0.667,0.626,0.708,0.815,0.71,0.855,0.699,0.603,0.847,0.625,0.737,0.614,0.682,0.396,0.738,0.818,0.854,0.666,0.402,0.828
Surfing,0.032,0.092,0.042,0.032,0.176,0.026,0.045,0.058,0.062,0.034,0.024,0.029,0.027,0.051,0.044,0.042,0.019,0.037,0.052,0.024,0.065,0.036,0.042,0.066,0.03,0.014,0.037,0.053,0.042,0.045,0.048,0.089,0.023,0.033,0.116,0.028,0.093,0.029,0.069,0.025,0.044,0.074,0.03,0.05,0.028,0.049,0.047,0.035,0.055,0.078,0.032,0.06,0.083
Swimming / Diving,0.123,0.237,0.168,0.133,0.254,0.108,0.21,0.176,0.23,0.203,0.157,0.115,0.108,0.185,0.201,0.173,0.193,0.254,0.266,0.263,0.196,0.194,0.165,0.174,0.258,0.107,0.238,0.266,0.222,0.104,0.157,0.142,0.118,0.114,0.262,0.125,0.173,0.195,0.232,0.237,0.26,0.268,0.134,0.177,0.181,0.171,0.174,0.185,0.317,0.298,0.175,0.195,0.271
Table tennis,0.052,0.06,0.09,0.057,0.13,0.093,0.067,0.135,0.232,0.085,0.05,0.079,0.055,0.113,0.084,0.066,0.062,0.062,0.255,0.093,0.095,0.091,0.072,0.074,0.029,0.099,0.08,0.141,0.059,0.035,0.062,0.066,0.101,0.057,0.147,0.09,0.046,0.158,0.162,0.098,0.17,0.058,0.087,0.041,0.157,0.075,0.176,0.116,0.183,0.209,0.064,0.044,0.191
Tennis,0.291,0.436,0.327,0.338,0.237,0.332,0.271,0.39,0.262,0.281,0.329,0.384,0.316,0.219,0.391,0.234,0.046,0.291,0.275,0.202,0.318,0.19,0.345,0.221,0.468,0.127,0.127,0.203,0.213,0.123,0.274,0.234,0.155,0.199,0.257,0.366,0.273,0.438,0.281,0.599,0.243,0.317,0.163,0.43,0.216,0.395,0.251,0.24,0.309,0.371,0.392,0.248,0.333
Triathlon,0.022,0.035,0.046,0.05,0.04,0.023,0.032,0.074,0.039,0.038,0.024,0.05,0.031,0.014,0.069,0.06,0.023,0.049,0.049,0.034,0.029,0.014,0.038,0.031,0.03,0.01,0.016,0.041,0.04,0.006,0.041,0.049,0.009,0.041,0.059,0.03,0.046,0.031,0.017,0.027,0.038,0.032,0.028,0.043,0.033,0.058,0.047,0.04,0.025,0.036,0.049,0.024,0.029
Volleyball,0.152,0.056,0.074,0.074,0.473,0.275,0.09,0.169,0.084,0.179,0.09,0.093,0.034,0.074,0.073,0.074,0.046,0.197,0.155,0.074,0.123,0.326,0.048,0.044,0.252,0.107,0.161,0.131,0.177,0.033,0.084,0.078,0.046,0.07,0.456,0.339,0.123,0.1,0.146,0.278,0.089,0.061,0.098,0.069,0.068,0.088,0.105,0.425,0.401,0.184,0.036,0.104,0.212
"Winter sports (e.g. skiing, ice skating)",0.189,0.302,0.496,0.241,0.238,0.273,0.43,0.293,0.26,0.19,0.367,0.475,0.251,0.08,0.341,0.356,0.031,0.257,0.266,0.24,0.148,0.107,0.242,0.126,0.377,0.284,0.078,0.179,0.303,0.042,0.331,0.278,0.055,0.461,0.149,0.38,0.195,0.27,0.116,0.352,0.149,0.193,0.349,0.207,0.431,0.473,0.204,0.159,0.22,0.151,0.277,0.361,0.12
Wrestling (e.g. WWE),0.099,0.135,0.08,0.065,0.178,0.107,0.146,0.213,0.069,0.166,0.051,0.064,0.05,0.313,0.069,0.084,0.268,0.121,0.075,0.075,0.314,0.123,0.117,0.104,0.085,0.034,0.323,0.219,0.342,0.129,0.077,0.143,0.327,0.081,0.296,0.071,0.108,0.101,0.326,0.053,0.157,0.418,0.074,0.085,0.061,0.078,0.075,0.149,0.152,0.368,0.127,0.195,0.15
Squash (to Q2 2025),0,0.021,0.012,0.011,0,0.008,0.012,0,0.015,0,0.008,0.022,0.014,0.039,0.011,0.016,0.001,0.006,0.047,0.022,0.022,0.008,0.015,0.01,0.007,0.006,0.001,0.038,0,0.005,0.02,0.029,0.01,0.008,0.007,0.016,0.01,0.01,0.023,0,0.03,0.017,0.015,0.011,0.012,0.018,0.012,0.021,0.017,0.022,0.017,0.007,0.014`

// ─── Parse the embedded CSV ───────────────────────────────────────────────────

function parseSeed(): {
  countries: { code: string; name: string }[]
  rows: Omit<SportInterestEntry, 'id' | 'last_updated'>[]
} {
  const lines = RAW.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const headerCols = lines[0].split(',')
  // First column is blank (the label column); remaining are country names
  const countryNames = headerCols.slice(1)
  const countries: { code: string; name: string }[] = countryNames.map(name => ({
    code: CSV_NAME_TO_ISO[name] ?? name,
    name,
  }))

  const rows: Omit<SportInterestEntry, 'id' | 'last_updated'>[] = lines.slice(1).map(line => {
    let label: string
    let valuesStr: string
    if (line.startsWith('"')) {
      const closeQuote = line.indexOf('"', 1)
      label = line.slice(1, closeQuote)
      valuesStr = line.slice(closeQuote + 2) // skip closing `",`
    } else {
      const commaIdx = line.indexOf(',')
      label = line.slice(0, commaIdx).trim()
      valuesStr = line.slice(commaIdx + 1)
    }
    const values = valuesStr.split(',')
    const scores: Record<string, number> = {}
    countries.forEach(({ code }, i) => {
      const v = parseFloat(values[i] ?? '0')
      if (!isNaN(v) && v > 0) scores[code] = v
    })
    return { label, scores }
  })

  return { countries, rows }
}

const { countries: INTEREST_COUNTRIES_PARSED, rows: SPORT_COUNTRY_SEED_PARSED } = parseSeed()

/** Ordered list of the 53 standard countries from the CSV. */
export const INTEREST_COUNTRIES: { code: string; name: string }[] = INTEREST_COUNTRIES_PARSED

/** Seed data for each of the 36 CSV sport labels (without id, last_updated). */
export const SPORT_COUNTRY_SEED: Omit<SportInterestEntry, 'id' | 'last_updated'>[] = SPORT_COUNTRY_SEED_PARSED

// Default discipline → interest-entry mappings for the 36 seed labels.
// discipline: null means "all disciplines under this sport_type".
const DEFAULT_MAPPINGS: Record<string, Array<{ sport_type: string; discipline: string | null }>> = {
  'American football': [{ sport_type: 'Football Codes', discipline: 'American Football' }],
  'Athletics': [{ sport_type: 'Athletics', discipline: null }],
  'Australian rules football (Australia and New Zealand Only)': [{ sport_type: 'Football Codes', discipline: 'Australian Football' }],
  'Badminton': [{ sport_type: 'Net / Racket Sports', discipline: 'Badminton' }],
  'Baseball': [{ sport_type: 'Bat & Ball Sports', discipline: 'Baseball' }],
  'Basketball': [{ sport_type: 'Goal Sports', discipline: 'Basketball' }],
  'Boxing': [{ sport_type: 'Combat Sports', discipline: 'Striking' }],
  'Cricket': [{ sport_type: 'Bat & Ball Sports', discipline: 'Cricket' }],
  'Cycling': [{ sport_type: 'Cycling', discipline: null }],
  'Field hockey': [{ sport_type: 'Hockey Sports', discipline: 'Field Hockey' }],
  'Gaelic football (Ireland Only)': [{ sport_type: 'Football Codes', discipline: 'Gaelic Football' }],
  'Gaelic hurling  (Ireland Only)': [],
  'Golf': [{ sport_type: 'Golf', discipline: 'Golf' }],
  'Gymnastics': [{ sport_type: 'Gymnastics', discipline: null }],
  'Handball (Select Markets Only)': [{ sport_type: 'Goal Sports', discipline: 'Handball' }],
  'Horse-racing / equestrian events': [{ sport_type: 'Animal Sports', discipline: null }],
  'Ice hockey': [{ sport_type: 'Hockey Sports', discipline: 'Ice Hockey' }],
  'Long-distance running (e.g. marathons)': [{ sport_type: 'Athletics', discipline: 'Running - Long Distance' }],
  'Martial arts': [{ sport_type: 'Combat Sports', discipline: null }],
  'Motor sports (e.g. Formula 1)': [{ sport_type: 'Motor Sports', discipline: null }],
  'Netball': [{ sport_type: 'Goal Sports', discipline: 'Netball' }],
  'Polo (equestrian sport)': [{ sport_type: 'Animal Sports', discipline: 'Equestrian - Polo' }],
  'Rowing': [{ sport_type: 'Water Sports', discipline: 'Rowing' }],
  'Rugby': [
    { sport_type: 'Football Codes', discipline: 'Rugby Union' },
    { sport_type: 'Football Codes', discipline: 'Rugby League' },
  ],
  'Sailing': [{ sport_type: 'Water Sports', discipline: 'Sailing' }],
  'Skateboarding': [{ sport_type: 'Board Sports', discipline: 'Skateboarding' }],
  'Soccer': [{ sport_type: 'Football Codes', discipline: 'Association Football' }],
  'Surfing': [{ sport_type: 'Board Sports', discipline: 'Surfing' }],
  'Swimming / Diving': [
    { sport_type: 'Water Sports', discipline: 'Swimming' },
    { sport_type: 'Water Sports', discipline: 'Diving' },
  ],
  'Table tennis': [{ sport_type: 'Net / Racket Sports', discipline: 'Table Tennis' }],
  'Tennis': [{ sport_type: 'Net / Racket Sports', discipline: 'Tennis' }],
  'Triathlon': [{ sport_type: 'Multi-Sport / Combined', discipline: 'Triathlon' }],
  'Volleyball': [{ sport_type: 'Net / Racket Sports', discipline: 'Volleyball' }],
  'Winter sports (e.g. skiing, ice skating)': [
    { sport_type: 'Skiing', discipline: null },
    { sport_type: 'Skating', discipline: null },
    { sport_type: 'Sled Sports', discipline: null },
  ],
  'Wrestling (e.g. WWE)': [
    { sport_type: 'Combat Sports', discipline: 'Wrestling - Amateur' },
    { sport_type: 'Combat Sports', discipline: 'Wrestling - Folk' },
  ],
  'Squash (to Q2 2025)': [{ sport_type: 'Net / Racket Sports', discipline: 'Squash' }],
}

/** Build the seeded list of SportInterestEntry objects (called once when no persisted data exists). */
export function makeDefaultSportInterestEntries(): SportInterestEntry[] {
  return SPORT_COUNTRY_SEED.map(row => ({
    id: crypto.randomUUID(),
    label: row.label,
    scores: row.scores,
    last_updated: '2026-06-18',
  }))
}

/**
 * Given a label→id map produced from makeDefaultSportInterestEntries(), returns the interest_id
 * that should be assigned to a discipline (sport_type, discipline) based on DEFAULT_MAPPINGS.
 * Used during coordinated first-run seeding so disciplines start pre-wired to interest entries.
 */
export function getDefaultInterestIdForDiscipline(
  sport_type: string,
  discipline: string,
  labelToId: Map<string, string>,
): string | null {
  for (const [label, mappings] of Object.entries(DEFAULT_MAPPINGS)) {
    const id = labelToId.get(label)
    if (!id) continue
    for (const m of mappings) {
      if (m.sport_type === sport_type && (m.discipline === discipline || m.discipline === null)) {
        return id
      }
    }
  }
  return null
}
