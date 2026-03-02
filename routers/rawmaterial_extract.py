import pdfplumber
import re
import sys
import json
import os
import io


def _open_pdf(pdf_content):
    """Open PDF from bytes or file path for pdfplumber."""
    if isinstance(pdf_content, bytes):
        return pdfplumber.open(io.BytesIO(pdf_content))
    if isinstance(pdf_content, (str, os.PathLike)):
        return pdfplumber.open(pdf_content)
    return pdfplumber.open(pdf_content)


def extract_pdf_data(pdf_content):
    """
    Extract drawing data from PDF (bytes or file path).
    Returns dict: Note, Title, Type, Stock Size, Material, Stocksize KG, Net WT KG.
    Returns None on error.
    """
    extracted_data = {
        "Note": None,
        "Title": None,
        "Type": None,
        "Stock Size": None,
        "Material": None,
        "Stocksize KG": None,
        "Net WT KG": None,
    }

    try:
        with _open_pdf(pdf_content) as pdf:
            page = pdf.pages[0]
            words = page.extract_words()

            def get_text_in_bbox(bbox):
                xmin, ymin, xmax, ymax = bbox
                filtered = [w for w in words if w['x0'] >= xmin and w['x1'] <= xmax and w['top'] >= ymin and w['bottom'] <= ymax]
                filtered.sort(key=lambda w: (round(w['top'], 1), w['x0']))

                lines = []
                current_line = []
                last_top = None
                for w in filtered:
                    if last_top is None or abs(w['top'] - last_top) < 6:
                        current_line.append(w['text'])
                        last_top = w['top']
                    else:
                        lines.append(" ".join(current_line))
                        current_line = [w['text']]
                        last_top = w['top']
                if current_line:
                    lines.append(" ".join(current_line))
                return "\n".join(lines).strip()

            def find_word(text_to_find):
                for w in words:
                    if text_to_find.lower() == w['text'].lower():
                        return w
                for w in words:
                    if text_to_find.lower() in w['text'].lower():
                        return w
                return None

            group_word = find_word("GROUP")
            super_word = find_word("Superceded")
            institute_y = None
            for w in words:
                if "Institute" in w['text']:
                    institute_y = w['top']
                    break

            # Extract TYPE
            type_word = find_word("TYPE")
            if type_word:
                right_bound = group_word['x0'] - 2 if group_word else page.width
                title_w = find_word("TITLE")
                bottom_bound = title_w['top'] - 2 if title_w else type_word['bottom'] + 15

                crop_box = (type_word['x1'] + 2, type_word['top'] - 12, right_bound, bottom_bound)
                text = page.crop(crop_box).extract_text(layout=True)
                if text:
                    text = text.replace("TYPE", "").replace("GROUP", "").replace("Used in", "").replace("Date", "")
                    text = re.sub(r'\b[A-Z]\b', '', text)
                    text = text.replace("EINTEGRATED", "INTEGRATED")
                    lines = [l.strip() for l in text.split('\n') if l.strip()]
                    extracted_data["Type"] = " ".join(lines).strip()

            # Extract TITLE
            title_word = find_word("TITLE")
            if title_word:
                right_bound = super_word['x0'] - 2 if super_word else page.width
                bottom_bound = institute_y - 2 if institute_y else title_word['bottom'] + 45

                crop_box = (title_word['x1'] + 2, title_word['top'] - 2, right_bound, bottom_bound)
                text = page.crop(crop_box).extract_text(layout=True)
                if text:
                    text = text.replace("TITLE", "")
                    lines = [l.strip() for l in text.split('\n') if l.strip() and "Institute" not in l]
                    extracted_data["Title"] = " ".join(lines).strip() if lines else text.strip()

            # Extract NOTE
            note_word = find_word("NOTE:")
            if not note_word:
                note_word = find_word("NOTE")
            if note_word:
                crop_box = (note_word['x0'] - 20, note_word['bottom'], page.width, note_word['bottom'] + 120)
                text = get_text_in_bbox(crop_box)
                if text:
                    text = re.sub(r'^[Nn]?[Oo]?[Tt]?[Ee]?:?\s*', '', text)
                    text = re.sub(r'^N?1\.?OTE:?\s*', '', text)
                    text = text.replace("1.A LL", "1. ALL").strip()
                    clean_lines = []
                    cutoff_keywords = ["THIS DRAWING", "CMTI", "(A GOVT. OF", "SOCIETY", "DRG NO", "ASSEMBLY", "STOCK SIZE", "MATERIAL", "SHOULD NOT BE COPIED", "OR LENT"]
                    for line in text.split('\n'):
                        line = line.strip()
                        if not line:
                            continue
                        line_upper = line.upper()
                        if any(k in line_upper for k in cutoff_keywords):
                            break
                        clean_lines.append(line)
                    extracted_data["Note"] = "\n".join(clean_lines)

            # Table headers at the bottom
            header_y_top = None
            for w in words:
                if w['text'].lower() == 'material':
                    header_y_top = w['top']
                    break

            if header_y_top is not None:
                value_ymin = header_y_top - 18
                value_ymax = header_y_top - 2

                row_words = [w for w in words if value_ymin <= (w['top'] + w['bottom']) / 2 <= value_ymax and w['x0'] > 100 and w['x1'] < page.width - 100]
                row_words.sort(key=lambda w: w['x0'])

                parts = []
                current_col = []
                last_x1 = None
                for w in row_words:
                    if w['bottom'] - w['top'] > 20:
                        continue
                    if last_x1 is not None and w['x0'] - last_x1 > 10:
                        parts.append(" ".join(current_col).strip())
                        current_col = [w['text']]
                    else:
                        current_col.append(w['text'])
                    last_x1 = w['x1']
                if current_col:
                    parts.append(" ".join(current_col).strip())

                if parts:
                    kg_parts = [p for p in parts if 'KG' in p.upper() or 'K.G' in p.upper() or 'K G' in p.upper()]

                    stock_size_idx = -1
                    for i, p in enumerate(parts):
                        p_up = p.upper()
                        is_dimension = re.search(r'\d+\s*[xX*]\s*\d+', p_up)
                        if "DIA" in p_up or "LENGTH" in p_up or "CYLINDER" in p_up or "BILLET" in p_up or is_dimension:
                            stock_size_idx = i
                            clean_str = re.sub(r'^\d+\s+', '', p.replace('\n', ' ')).strip()
                            extracted_data["Stock Size"] = clean_str
                        elif p_up in ["EN8", "C.I.", "MS", "ST", "ALUMINIUM"] or "EN" in p_up or "STEEL" in p_up or "DIN" in p_up or "CR" in p_up or "OHNS" in p_up or "CAST IRON" in p_up:
                            extracted_data["Material"] = p.strip()

                    all_kgs = []
                    for k in kg_parts:
                        matches = re.findall(r'[\d\.]+\s*K\.?G\.?', k, re.IGNORECASE)
                        if matches:
                            all_kgs.extend(matches)
                        else:
                            all_kgs.append(k)

                    if len(all_kgs) >= 1:
                        extracted_data["Net WT KG"] = all_kgs[0].strip()
                    if len(all_kgs) >= 2:
                        extracted_data["Stocksize KG"] = all_kgs[1].strip()

                    if not extracted_data["Stock Size"] and len(parts) >= 2:
                        clean_str = re.sub(r'^\d+\s+', '', parts[1].replace('\n', ' ')).strip()
                        extracted_data["Stock Size"] = clean_str

                    if not extracted_data["Material"]:
                        if stock_size_idx != -1 and stock_size_idx + 1 < len(parts):
                            candidate = parts[stock_size_idx + 1]
                            if "KG" not in candidate.upper():
                                extracted_data["Material"] = candidate

        return extracted_data

    except Exception as e:
        print(f"Error reading PDF: {e}")
        return None


# Alias for documents endpoint
extract_data_from_pdf = extract_pdf_data


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

    if len(sys.argv) < 2:
        print("Usage: python rawmaterial_extract.py <path_to_pdf>")
        sys.exit(1)

    test_pdf = sys.argv[1]
    if not os.path.exists(test_pdf):
        print(f"Error: File '{test_pdf}' not found.")
        sys.exit(1)

    print(f"Extracting data from: {test_pdf}")
    result = extract_pdf_data(test_pdf)

    if result:
        output_filename = "extracted_data.json"
        with open(output_filename, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=4)
        print(f"\n--- EXTRACTED DATA SAVED TO {output_filename} ---")
        print(json.dumps(result, indent=4))
    else:
        print("Failed to extract data.")
