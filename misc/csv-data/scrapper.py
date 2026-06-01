import requests
from bs4 import BeautifulSoup
import csv
import time
import random
from urllib.parse import urljoin

def scrape_exhaustive_gpus():
    print("Initializing GPU Deep-Scrape Pipeline...")
    base_url = "https://www.techpowerup.com"
    start_url = f"{base_url}/gpu-specs/"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Referer": "https://www.google.com/"
    }
    
    session = requests.Session()
    session.headers.update(headers)
    
    csv_file = "GPU_Exhaustive_Database.csv"
    with open(csv_file, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["Base_Chip", "AIB_Partner", "Custom_Model_Name", "Base_Clock", "Boost_Clock", "Memory_Clock", "Length", "Image_URL"])

    # Phase 1: Horizontal Traversal (Getting the Reference Chips)
    print("Scanning primary GPU index...")
    response = session.get(start_url)
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # NOTE: You must inspect the live site to confirm 'table.processors' or 'div.gpu-list'
    chip_links = []
    for link in soup.select('td.model-name a'):
        chip_links.append(urljoin(base_url, link['href']))

    print(f"Discovered {len(chip_links)} core architectures. Commencing Phase 2...")

    # Phase 2: Vertical Traversal (Diving into each chip for AIBs)
    for chip_url in chip_links:
        print(f"Diving into: {chip_url}")
        try:
            chip_resp = session.get(chip_url, timeout=10)
            if chip_resp.status_code == 429:
                print("Rate limit reached. Aborting to protect IP.")
                break
                
            chip_soup = BeautifulSoup(chip_resp.text, 'html.parser')
            base_chip_name = chip_soup.select_one('h1.gpudb-name').text.strip() if chip_soup.select_one('h1.gpudb-name') else "Unknown"
            
            # Locate the custom boards table
            custom_boards_table = chip_soup.select('table.custom-boards tr')
            
            with open(csv_file, mode='a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                
                # Skip the header row
                for row in custom_boards_table[1:]:
                    cols = row.find_all('td')
                    if len(cols) >= 5:
                        aib_partner = cols[0].text.strip()
                        custom_model = cols[1].text.strip()
                        base_clock = cols[2].text.strip()
                        boost_clock = cols[3].text.strip()
                        memory_clock = cols[4].text.strip()
                        
                        # Extract image URL from the row if it exists
                        img_tag = row.find('img')
                        image_url = urljoin(base_url, img_tag['src']) if img_tag and 'src' in img_tag.attrs else "No Image"
                        
                        writer.writerow([base_chip_name, aib_partner, custom_model, base_clock, boost_clock, memory_clock, "Extractable_via_DOM", image_url])
            
            # CRITICAL: Anti-Bot Throttling. Do not lower this.
            time.sleep(random.uniform(5.0, 10.0))
            
        except Exception as e:
            print(f"Error parsing {chip_url}: {e}")
            continue

    print("GPU Deep-Scrape complete.")

if __name__ == "__main__":
    scrape_exhaustive_gpus()