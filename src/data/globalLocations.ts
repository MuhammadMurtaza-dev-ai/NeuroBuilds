export const GLOBAL_LOCATIONS: Record<string, Record<string, string[]>> = {
  Pakistan: {
    Lahore: [
      'Gulberg', 'DHA Phase 1', 'DHA Phase 5', 'DHA Phase 6',
      'Johar Town', 'Model Town', 'Bahria Town', 'Cantt',
      'Allama Iqbal Town', 'Wapda Town', 'Garden Town', 'Shadman',
    ],
    Karachi: [
      'Clifton', 'DHA Phase 1', 'DHA Phase 6', 'Gulshan-e-Iqbal',
      'North Nazimabad', 'Korangi', 'Saddar', 'Bahadurabad',
      'PECHS', 'Gulistan-e-Johar', 'Federal B Area', 'Malir',
    ],
    Islamabad: [
      'F-7', 'F-10', 'F-11', 'G-9', 'G-11',
      'Blue Area', 'DHA Phase 1', 'DHA Phase 2', 'Bahria Town',
      'Bani Gala', 'I-8', 'E-11',
    ],
    Rawalpindi: [
      'Saddar', 'Bahria Town', 'DHA Phase 1', 'Gulraiz Housing',
      'Westridge', 'Satellite Town', 'Chaklala Scheme', 'Adiala Road',
    ],
    Faisalabad: [
      'Peoples Colony', 'Gulberg', 'Madina Town', 'Canal Road',
      'Samanabad', 'Millat Town', 'D Ground', 'Jinnah Colony',
    ],
    Peshawar: [
      'Hayatabad', 'University Town', 'Saddar', 'Cantt',
      'Gulbahar', 'Regi Model Town', 'Defence Colony',
    ],
    Multan: [
      'Gulgasht Colony', 'Bosan Road', 'Cantt', 'Shah Rukn-e-Alam',
      'New Multan', 'Gulshan-e-Iqbal', 'Model Town',
    ],
    Sialkot: [
      'Cantt', 'Defence Road', 'Paris Road', 'Allama Iqbal Road',
      'Gulshan Colony', 'Iqbal Town',
    ],
    Gujranwala: [
      'Peoples Colony', 'Satellite Town', 'Trust Colony',
      'GT Road', 'Gulshan Colony', 'Rehman Pura',
    ],
    Quetta: [
      'Satellite Town', 'Jinnah Town', 'Cantt', 'Civil Lines',
      'Sariab Road', 'Brewery Road',
    ],
  },

  'United States': {
    California: ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento'],
    Texas: ['Houston', 'Austin', 'Dallas', 'San Antonio', 'Fort Worth'],
    'New York': ['New York City', 'Buffalo', 'Albany', 'Rochester', 'Syracuse'],
    Florida: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale'],
    Washington: ['Seattle', 'Spokane', 'Tacoma', 'Bellevue', 'Redmond'],
    Illinois: ['Chicago', 'Aurora', 'Naperville', 'Rockford', 'Joliet'],
    Georgia: ['Atlanta', 'Savannah', 'Augusta', 'Columbus', 'Macon'],
    Colorado: ['Denver', 'Boulder', 'Colorado Springs', 'Aurora', 'Fort Collins'],
  },

  'United Kingdom': {
    England: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Bristol', 'Sheffield'],
    Scotland: ['Edinburgh', 'Glasgow', 'Aberdeen', 'Dundee', 'Inverness'],
    Wales: ['Cardiff', 'Swansea', 'Newport', 'Wrexham', 'Barry'],
    'Northern Ireland': ['Belfast', 'Derry', 'Lisburn', 'Newry', 'Armagh'],
  },

  India: {
    Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad'],
    'Karnataka': ['Bengaluru', 'Mysuru', 'Hubli', 'Mangaluru', 'Belagavi'],
    'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'],
    Delhi: ['New Delhi', 'Noida', 'Dwarka', 'Rohini', 'Lajpat Nagar'],
    Telangana: ['Hyderabad', 'Warangal', 'Nizamabad', 'Khammam', 'Karimnagar'],
    'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Meerut'],
    Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar'],
    'West Bengal': ['Kolkata', 'Howrah', 'Asansol', 'Durgapur', 'Siliguri'],
  },

  UAE: {
    Dubai: ['Downtown Dubai', 'Dubai Marina', 'JLT', 'Deira', 'Bur Dubai', 'Business Bay'],
    'Abu Dhabi': ['Al Reem Island', 'Khalidiyah', 'Corniche', 'Yas Island', 'Saadiyat Island'],
    Sharjah: ['Al Nahda', 'Al Majaz', 'Muwailih', 'Al Taawun', 'Industrial Area'],
    Ajman: ['Al Nuaimiya', 'Al Rashidiya', 'Al Jurf', 'Al Rumaila'],
    'Ras Al Khaimah': ['Al Nakheel', 'Al Hamra', 'Al Uraibi', 'Dafan Al Nakheel'],
  },

  Germany: {
    Bavaria: ['Munich', 'Nuremberg', 'Augsburg', 'Regensburg', 'Würzburg'],
    Berlin: ['Mitte', 'Prenzlauer Berg', 'Friedrichshain', 'Kreuzberg', 'Charlottenburg'],
    'North Rhine-Westphalia': ['Cologne', 'Düsseldorf', 'Dortmund', 'Essen', 'Bochum'],
    Hamburg: ['Altona', 'Eimsbüttel', 'Harburg', 'Wandsbek', 'Bergedorf'],
    'Baden-Württemberg': ['Stuttgart', 'Karlsruhe', 'Mannheim', 'Freiburg', 'Heidelberg'],
  },

  Canada: {
    Ontario: ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton'],
    'British Columbia': ['Vancouver', 'Surrey', 'Burnaby', 'Richmond', 'Victoria'],
    Quebec: ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Longueuil'],
    Alberta: ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'St. Albert'],
    'Nova Scotia': ['Halifax', 'Dartmouth', 'Sydney', 'Truro', 'New Glasgow'],
  },

  Australia: {
    'New South Wales': ['Sydney', 'Newcastle', 'Wollongong', 'Central Coast', 'Parramatta'],
    Victoria: ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Shepparton'],
    Queensland: ['Brisbane', 'Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns'],
    'Western Australia': ['Perth', 'Fremantle', 'Mandurah', 'Bunbury', 'Geraldton'],
    'South Australia': ['Adelaide', 'Mount Gambier', 'Whyalla', 'Murray Bridge'],
  },
};

export const COUNTRY_LIST: string[] = Object.keys(GLOBAL_LOCATIONS).sort();

export const COUNTRY_ISO: Record<string, string> = {
  Pakistan: 'pk',
  'United States': 'us',
  'United Kingdom': 'gb',
  India: 'in',
  UAE: 'ae',
  Germany: 'de',
  Canada: 'ca',
  Australia: 'au',
};
