// lib/area-codes.js
//
// US area code -> "City, State", for the text the assistant gets before the
// divert call so he can say where the spectator is "calling from".
//
// GENERATED from Ringer/AreaCodes.swift. The app has carried this table offline
// since the beginning; the clip and the web dialler cannot, because neither can
// hold the assistant's number either and both have to ask the server anyway.
// Regenerate rather than edit: if the two drift, the same number produces a
// different city depending on which of the three dialled it, and the one that
// is wrong is whichever one Shine is not looking at.

export const STATES = {
  "AK": "Alaska", "AL": "Alabama", "AR": "Arkansas", "AZ": "Arizona", "CA": "California",
  "CO": "Colorado", "CT": "Connecticut", "DC": "D.C.", "DE": "Delaware", "FL": "Florida",
  "GA": "Georgia", "HI": "Hawaii", "IA": "Iowa", "ID": "Idaho", "IL": "Illinois",
  "IN": "Indiana", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "MA": "Massachusetts",
  "MD": "Maryland", "ME": "Maine", "MI": "Michigan", "MN": "Minnesota", "MO": "Missouri",
  "MS": "Mississippi", "MT": "Montana", "NC": "North Carolina", "ND": "North Dakota",
  "NE": "Nebraska", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
  "NV": "Nevada", "NY": "New York", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon",
  "PA": "Pennsylvania", "PR": "Puerto Rico", "RI": "Rhode Island", "SC": "South Carolina",
  "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VA": "Virginia",
  "VT": "Vermont", "WA": "Washington", "WI": "Wisconsin", "WV": "West Virginia",
  "WY": "Wyoming"
};

export const CITIES = {
  "201": "Jersey City, NJ", "202": "Washington, DC", "203": "New Haven, CT",
  "205": "Birmingham, AL", "206": "Seattle, WA", "207": "Portland, ME", "208": "Boise, ID",
  "209": "Stockton, CA", "210": "San Antonio, TX", "212": "New York, NY",
  "213": "Los Angeles, CA", "214": "Dallas, TX", "215": "Philadelphia, PA",
  "216": "Cleveland, OH", "217": "Springfield, IL", "218": "Duluth, MN", "219": "Gary, IN",
  "224": "Waukegan, IL", "225": "Baton Rouge, LA", "228": "Biloxi, MS", "229": "Albany, GA",
  "231": "Traverse City, MI", "234": "Akron, OH", "239": "Fort Myers, FL",
  "240": "Silver Spring, MD", "248": "Troy, MI", "251": "Mobile, AL", "252": "Greenville, NC",
  "253": "Tacoma, WA", "254": "Waco, TX", "256": "Huntsville, AL", "260": "Fort Wayne, IN",
  "262": "Kenosha, WI", "267": "Philadelphia, PA", "269": "Kalamazoo, MI",
  "270": "Bowling Green, KY", "276": "Bristol, VA", "281": "Houston, TX",
  "301": "Rockville, MD", "302": "Wilmington, DE", "303": "Denver, CO",
  "304": "Charleston, WV", "305": "Miami, FL", "307": "Cheyenne, WY",
  "308": "Grand Island, NE", "309": "Peoria, IL", "310": "Los Angeles, CA",
  "312": "Chicago, IL", "313": "Detroit, MI", "314": "St. Louis, MO", "315": "Syracuse, NY",
  "316": "Wichita, KS", "317": "Indianapolis, IN", "318": "Shreveport, LA",
  "319": "Cedar Rapids, IA", "320": "St. Cloud, MN", "321": "Orlando, FL",
  "323": "Los Angeles, CA", "325": "Abilene, TX", "330": "Akron, OH", "331": "Aurora, IL",
  "334": "Montgomery, AL", "336": "Greensboro, NC", "337": "Lafayette, LA",
  "339": "Boston, MA", "347": "New York, NY", "351": "Lowell, MA", "352": "Gainesville, FL",
  "360": "Olympia, WA", "361": "Corpus Christi, TX", "385": "Salt Lake City, UT",
  "386": "Daytona Beach, FL", "401": "Providence, RI", "402": "Omaha, NE",
  "404": "Atlanta, GA", "405": "Oklahoma City, OK", "406": "Billings, MT",
  "407": "Orlando, FL", "408": "San Jose, CA", "409": "Beaumont, TX", "410": "Baltimore, MD",
  "412": "Pittsburgh, PA", "413": "Springfield, MA", "414": "Milwaukee, WI",
  "415": "San Francisco, CA", "417": "Springfield, MO", "419": "Toledo, OH",
  "423": "Chattanooga, TN", "424": "Los Angeles, CA", "425": "Bellevue, WA",
  "430": "Tyler, TX", "432": "Midland, TX", "434": "Charlottesville, VA",
  "435": "St. George, UT", "440": "Lorain, OH", "442": "Palm Springs, CA",
  "443": "Baltimore, MD", "469": "Dallas, TX", "470": "Atlanta, GA", "478": "Macon, GA",
  "479": "Fayetteville, AR", "480": "Scottsdale, AZ", "484": "Allentown, PA",
  "501": "Little Rock, AR", "502": "Louisville, KY", "503": "Portland, OR",
  "504": "New Orleans, LA", "505": "Albuquerque, NM", "507": "Rochester, MN",
  "508": "Worcester, MA", "509": "Spokane, WA", "510": "Oakland, CA", "512": "Austin, TX",
  "513": "Cincinnati, OH", "515": "Des Moines, IA", "516": "Long Island, NY",
  "517": "Lansing, MI", "518": "Albany, NY", "520": "Tucson, AZ", "530": "Redding, CA",
  "539": "Tulsa, OK", "540": "Roanoke, VA", "541": "Eugene, OR", "551": "Jersey City, NJ",
  "559": "Fresno, CA", "561": "West Palm Beach, FL", "562": "Long Beach, CA",
  "563": "Davenport, IA", "567": "Toledo, OH", "570": "Scranton, PA", "571": "Arlington, VA",
  "573": "Columbia, MO", "574": "South Bend, IN", "575": "Las Cruces, NM", "580": "Lawton, OK",
  "585": "Rochester, NY", "586": "Warren, MI", "601": "Jackson, MS", "602": "Phoenix, AZ",
  "603": "Manchester, NH", "605": "Sioux Falls, SD", "606": "Ashland, KY",
  "607": "Binghamton, NY", "608": "Madison, WI", "609": "Trenton, NJ", "610": "Allentown, PA",
  "612": "Minneapolis, MN", "614": "Columbus, OH", "615": "Nashville, TN",
  "616": "Grand Rapids, MI", "617": "Boston, MA", "618": "Belleville, IL",
  "619": "San Diego, CA", "620": "Dodge City, KS", "623": "Glendale, AZ",
  "626": "Pasadena, CA", "628": "San Francisco, CA", "629": "Nashville, TN",
  "630": "Naperville, IL", "631": "Long Island, NY", "636": "St. Charles, MO",
  "641": "Mason City, IA", "646": "New York, NY", "650": "San Mateo, CA",
  "651": "St. Paul, MN", "660": "Sedalia, MO", "661": "Bakersfield, CA", "662": "Tupelo, MS",
  "667": "Baltimore, MD", "678": "Atlanta, GA", "680": "Syracuse, NY", "681": "Charleston, WV",
  "682": "Fort Worth, TX", "701": "Fargo, ND", "702": "Las Vegas, NV", "703": "Arlington, VA",
  "704": "Charlotte, NC", "706": "Augusta, GA", "707": "Santa Rosa, CA", "708": "Oak Park, IL",
  "712": "Sioux City, IA", "713": "Houston, TX", "714": "Anaheim, CA", "715": "Eau Claire, WI",
  "716": "Buffalo, NY", "717": "Harrisburg, PA", "718": "New York, NY",
  "719": "Colorado Springs, CO", "720": "Denver, CO", "724": "Greensburg, PA",
  "725": "Las Vegas, NV", "727": "St. Petersburg, FL", "731": "Jackson, TN",
  "732": "New Brunswick, NJ", "734": "Ann Arbor, MI", "737": "Austin, TX",
  "740": "Zanesville, OH", "743": "Greensboro, NC", "754": "Fort Lauderdale, FL",
  "757": "Norfolk, VA", "760": "Oceanside, CA", "762": "Augusta, GA", "763": "Maple Grove, MN",
  "765": "Muncie, IN", "770": "Marietta, GA", "772": "Port St. Lucie, FL",
  "773": "Chicago, IL", "774": "Worcester, MA", "775": "Reno, NV", "779": "Rockford, IL",
  "781": "Waltham, MA", "785": "Topeka, KS", "786": "Miami, FL", "787": "San Juan, PR",
  "801": "Salt Lake City, UT", "802": "Burlington, VT", "803": "Columbia, SC",
  "804": "Richmond, VA", "805": "Santa Barbara, CA", "806": "Amarillo, TX",
  "808": "Honolulu, HI", "810": "Flint, MI", "812": "Evansville, IN", "813": "Tampa, FL",
  "814": "Erie, PA", "815": "Rockford, IL", "816": "Kansas City, MO", "817": "Fort Worth, TX",
  "818": "Burbank, CA", "828": "Asheville, NC", "830": "New Braunfels, TX",
  "831": "Salinas, CA", "832": "Houston, TX", "843": "Charleston, SC",
  "845": "Poughkeepsie, NY", "847": "Schaumburg, IL", "848": "Toms River, NJ",
  "850": "Tallahassee, FL", "854": "Charleston, SC", "856": "Camden, NJ", "857": "Boston, MA",
  "858": "San Diego, CA", "859": "Lexington, KY", "860": "Hartford, CT", "862": "Newark, NJ",
  "863": "Lakeland, FL", "864": "Greenville, SC", "865": "Knoxville, TN",
  "870": "Jonesboro, AR", "872": "Chicago, IL", "878": "Pittsburgh, PA", "901": "Memphis, TN",
  "903": "Tyler, TX", "904": "Jacksonville, FL", "906": "Marquette, MI",
  "907": "Anchorage, AK", "908": "Elizabeth, NJ", "909": "San Bernardino, CA",
  "910": "Fayetteville, NC", "912": "Savannah, GA", "913": "Kansas City, KS",
  "914": "Yonkers, NY", "915": "El Paso, TX", "916": "Sacramento, CA", "917": "New York, NY",
  "918": "Tulsa, OK", "919": "Raleigh, NC", "920": "Green Bay, WI", "925": "Concord, CA",
  "928": "Yuma, AZ", "929": "New York, NY", "931": "Clarksville, TN", "936": "Conroe, TX",
  "937": "Dayton, OH", "940": "Denton, TX", "941": "Sarasota, FL", "949": "Irvine, CA",
  "951": "Riverside, CA", "952": "Bloomington, MN", "954": "Fort Lauderdale, FL",
  "956": "Laredo, TX", "970": "Fort Collins, CO", "971": "Portland, OR", "972": "Dallas, TX",
  "973": "Newark, NJ", "978": "Lowell, MA", "979": "College Station, TX",
  "980": "Charlotte, NC", "984": "Raleigh, NC", "985": "Houma, LA", "989": "Saginaw, MI"
};

// Same rules as AreaCodes.city(for:): strip non-digits, drop a leading country
// code, take the first three, and expand "City, ST" so the state is unambiguous.
// Returns null for an unknown code, and the caller leaves the city out rather
// than inventing one.
export function cityFor(raw) {
  let d = String(raw || "").replace(/[^0-9]/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  if (d.length < 3) return null;
  const entry = CITIES[d.slice(0, 3)];
  if (!entry) return null;
  const parts = entry.split(", ");
  if (parts.length === 2 && STATES[parts[1]]) return parts[0] + ", " + STATES[parts[1]];
  return entry;
}
