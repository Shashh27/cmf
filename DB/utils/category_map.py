# DB/utils/category_map.py
# Authoritative item_description → (category, sub_category) mapping.
# Add new items here as inventory grows.

CATEGORY_MAP: dict[str, tuple[str, str]] = {

    # ── TOOLS / Keys & Wrenches ───────────────────────────────────────────
    "Allen Key":                                        ("Tools", "Keys & Wrenches"),
    "T - Allen Key":                                    ("Tools", "Keys & Wrenches"),
    "Allen Key Set":                                    ("Tools", "Keys & Wrenches"),
    "Box Spanner":                                      ("Tools", "Keys & Wrenches"),
    "Combination Spanner":                              ("Tools", "Keys & Wrenches"),
    "C - Spanner":                                      ("Tools", "Keys & Wrenches"),
    "Open End Spanner ( Double End )":                  ("Tools", "Keys & Wrenches"),
    "Open End Spanner ( Single End )":                  ("Tools", "Keys & Wrenches"),
    "Ring Spanner":                                     ("Tools", "Keys & Wrenches"),
    "Hook Wrench":                                      ("Tools", "Keys & Wrenches"),
    "Tap Wrench":                                       ("Tools", "Keys & Wrenches"),
    "French Adjustable Wrench (Small)":                 ("Tools", "Keys & Wrenches"),
    "French Adjustable Wrench (Big)":                   ("Tools", "Keys & Wrenches"),
    "Pipe Wrench":                                      ("Tools", "Keys & Wrenches"),
    "Torque Wrench":                                    ("Tools", "Keys & Wrenches"),
    "Torque Wrench Set ( NC )":                         ("Tools", "Keys & Wrenches"),
    "Socket Wrench Bits":                               ("Tools", "Keys & Wrenches"),
    "PKM Spanners":                                     ("Tools", "Keys & Wrenches"),
    "D'andrea Fine Adjustment Screw Driver":            ("Tools", "Keys & Wrenches"),

    # ── TOOLS / Drills ────────────────────────────────────────────────────
    "Straight Shank Drill":                             ("Tools", "Drills"),
    "Straight Shank Drill (Long Series)":               ("Tools", "Drills"),
    "Straight Shank Drill (Solid Carbide)":             ("Tools", "Drills"),
    "Straight Shank Drill (Carbide Tipped)":            ("Tools", "Drills"),
    "Taper Shank Drill":                                ("Tools", "Drills"),
    "Taper Shank Drill (Carbide Tipped)":               ("Tools", "Drills"),
    "Taper Shank Drill (Long Series)":                  ("Tools", "Drills"),
    "U Drill":                                          ("Tools", "Drills"),
    "Center Drill (Type A )":                           ("Tools", "Drills"),
    "Center Drill (Type B )":                           ("Tools", "Drills"),
    "Drill Chuck":                                      ("Tools", "Drills"),

    # ── TOOLS / Milling Cutters ───────────────────────────────────────────
    "End Mill ( Flat )":                                ("Tools", "Milling Cutters"),
    "End Mill ( Ball Nose )":                           ("Tools", "Milling Cutters"),
    "End Mill ( Bull Nose )":                           ("Tools", "Milling Cutters"),
    "End Mill":                                         ("Tools", "Milling Cutters"),
    "End mill cutter":                                  ("Tools", "Milling Cutters"),
    "End mill cutter extra length":                     ("Tools", "Milling Cutters"),
    "Inserted Tip EndMill ( Single Tip )":              ("Tools", "Milling Cutters"),
    "Inserted Tip EndMill ( Two Tip )":                 ("Tools", "Milling Cutters"),
    "Inserted Tip EndMill ( Three Tip )":               ("Tools", "Milling Cutters"),
    "Inserted Tip Ballnose Endmill":                    ("Tools", "Milling Cutters"),
    "Inserted Tip Bullnose Endmill":                    ("Tools", "Milling Cutters"),
    "Face Milling Cutter ( Arbor Type )":               ("Tools", "Milling Cutters"),
    "Face mill":                                        ("Tools", "Milling Cutters"),
    "Shoulder Milling Cutter ( Arbor Type )":           ("Tools", "Milling Cutters"),
    "Shoulder Milling Cutter ( Shank Type )":           ("Tools", "Milling Cutters"),
    "Chamfer Milling Cutter ( Single point )":          ("Tools", "Milling Cutters"),
    "Chamfer Milling Cutter ( Three point )":           ("Tools", "Milling Cutters"),
    "Groove Milling Cutter (Shank Type)":               ("Tools", "Milling Cutters"),
    "Groove Milling Cutter (Shell Type)":               ("Tools", "Milling Cutters"),
    "Groove Milling Cutter (Disc Type)":                ("Tools", "Milling Cutters"),
    "Side Face Cutter":                                 ("Tools", "Milling Cutters"),
    "Side Face Cutter ( Single Side Cutting )":         ("Tools", "Milling Cutters"),
    "Hole Mill":                                        ("Tools", "Milling Cutters"),
    "Shell Type Hole Mill":                             ("Tools", "Milling Cutters"),
    "T - Slot Cutter":                                  ("Tools", "Milling Cutters"),
    "Slot Drill":                                       ("Tools", "Milling Cutters"),
    "Slitting Saw":                                     ("Tools", "Milling Cutters"),
    "Dovetail Cutter ( External )":                     ("Tools", "Milling Cutters"),
    "Dovetail Cutter ( Internal )":                     ("Tools", "Milling Cutters"),
    "Dovetail cutter":                                  ("Tools", "Milling Cutters"),

    # ── TOOLS / Boring Bars & Tools ───────────────────────────────────────
    "Boring Bar":                                       ("Tools", "Boring Bars & Tools"),
    "Boring Bar ID":                                    ("Tools", "Boring Bars & Tools"),
    "Boring Tool":                                      ("Tools", "Boring Bars & Tools"),
    "D'andrea Boaring Bar (Roughing)":                  ("Tools", "Boring Bars & Tools"),
    "D'andrea Boaring Bar (Finishing)":                 ("Tools", "Boring Bars & Tools"),
    "D'andrea Boaring Bar Adapters":                    ("Tools", "Boring Bars & Tools"),
    "D'andrea Boaring Bar Catridge":                    ("Tools", "Boring Bars & Tools"),
    "D'andrea Boaring Bar Catridge Holders":            ("Tools", "Boring Bars & Tools"),
    "D'andrea Boaring Bar Kit":                         ("Tools", "Boring Bars & Tools"),

    # ── TOOLS / Turning & Threading Tools ────────────────────────────────
    "Turning Tool":                                     ("Tools", "Turning & Threading Tools"),
    "Parting Tool":                                     ("Tools", "Turning & Threading Tools"),
    "Radius Turning Tool":                              ("Tools", "Turning & Threading Tools"),
    "External Threading Tool":                          ("Tools", "Turning & Threading Tools"),
    "Internal Threading Tool":                          ("Tools", "Turning & Threading Tools"),
    "O D Grooving Tool":                                ("Tools", "Turning & Threading Tools"),
    "O D Relief Grooving Tool":                         ("Tools", "Turning & Threading Tools"),
    "I D Grooving Tool":                                ("Tools", "Turning & Threading Tools"),
    "Face Grooving Tool":                               ("Tools", "Turning & Threading Tools"),
    "Knurling Tool":                                    ("Tools", "Turning & Threading Tools"),
    "Blade Holder":                                     ("Tools", "Turning & Threading Tools"),
    "PKM Tool Holders":                                 ("Tools", "Turning & Threading Tools"),
    "VDI Static Tool Holder":                           ("Tools", "Turning & Threading Tools"),
    "Tool Holders & inserts":                           ("Tools", "Turning & Threading Tools"),

    # ── TOOLS / Reamers ───────────────────────────────────────────────────
    "Hand Reamer":                                      ("Tools", "Reamers"),
    "Hand Reamer ( Taper )":                            ("Tools", "Reamers"),
    "Machine Reamer ( Straight Shank )":                ("Tools", "Reamers"),
    "Machine Reamer ( Taper Shank )":                   ("Tools", "Reamers"),
    "Machine Reamer ( Shell Type )":                    ("Tools", "Reamers"),

    # ── TOOLS / Counterbores & Countersinks ──────────────────────────────
    "Counter Bore":                                     ("Tools", "Counterbores & Countersinks"),
    "Counter Sink":                                     ("Tools", "Counterbores & Countersinks"),
    "Countersink Bore":                                 ("Tools", "Counterbores & Countersinks"),
    "Shell Type Counter Bore":                          ("Tools", "Counterbores & Countersinks"),

    # ── TOOLS / Taps & Dies ───────────────────────────────────────────────
    "Hand Taps - PZ":                                   ("Tools", "Taps & Dies"),
    "Hand Taps - BSW":                                  ("Tools", "Taps & Dies"),
    "Hand Taps - BSP":                                  ("Tools", "Taps & Dies"),
    "Hand Taps - NPT":                                  ("Tools", "Taps & Dies"),
    "Hand Taps - MJ":                                   ("Tools", "Taps & Dies"),
    "Hand Taps - UNF":                                  ("Tools", "Taps & Dies"),
    "Hand Taps - Metric (Standard)":                    ("Tools", "Taps & Dies"),
    "Hand Taps - Metric (Fine Pitch)":                  ("Tools", "Taps & Dies"),
    "Hand Taps - Metric (Fine Pitch)(Machine Tap)":     ("Tools", "Taps & Dies"),
    "Hand Taps - Metric (Fine Pitch)(LH)":              ("Tools", "Taps & Dies"),
    "HSS TAP SET":                                      ("Tools", "Taps & Dies"),
    "Die":                                              ("Tools", "Taps & Dies"),
    "Die Stock":                                        ("Tools", "Taps & Dies"),
    "Tap Extention":                                    ("Tools", "Taps & Dies"),

    # ── TOOLS / Collets & Holders ─────────────────────────────────────────
    "PKM Collets ER 40":                                ("Tools", "Collets & Holders"),
    "PKM Collets ER 25":                                ("Tools", "Collets & Holders"),
    "PKM Collets ER 20":                                ("Tools", "Collets & Holders"),
    "PKM Collets ER 16":                                ("Tools", "Collets & Holders"),
    "PKM Collets ER 11":                                ("Tools", "Collets & Holders"),
    "PKM Collets ER 8":                                 ("Tools", "Collets & Holders"),
    "Sleeve":                                           ("Tools", "Collets & Holders"),
    "Mandrel":                                          ("Tools", "Collets & Holders"),

    # ── TOOLS / Clamps & Workholding ──────────────────────────────────────
    "C - Clamp":                                        ("Tools", "Clamps & Workholding"),
    "Strap Clamp":                                      ("Tools", "Clamps & Workholding"),
    "U - Strap Clamp":                                  ("Tools", "Clamps & Workholding"),
    "Goose Neck Clamp":                                 ("Tools", "Clamps & Workholding"),
    "Twist Clamp":                                      ("Tools", "Clamps & Workholding"),
    "V - Block Clamp":                                  ("Tools", "Clamps & Workholding"),
    "T - Nut":                                          ("Tools", "Clamps & Workholding"),
    "Flange Nut":                                       ("Tools", "Clamps & Workholding"),
    "Extension Nut":                                    ("Tools", "Clamps & Workholding"),
    "Extension Stud":                                   ("Tools", "Clamps & Workholding"),
    "Eye Bolt":                                         ("Tools", "Clamps & Workholding"),
    "D - Shackle":                                      ("Tools", "Clamps & Workholding"),
    "Web Sling":                                        ("Tools", "Clamps & Workholding"),
    "Web Sling with Hook":                              ("Tools", "Clamps & Workholding"),
    "Screw Jack":                                       ("Tools", "Clamps & Workholding"),
    "Grinding Carrier":                                 ("Tools", "Clamps & Workholding"),
    "Lathe Carrier ( Straight )":                       ("Tools", "Clamps & Workholding"),
    "Lathe Carrier ( Bend )":                           ("Tools", "Clamps & Workholding"),

    # ── TOOLS / Centres & Arbors ──────────────────────────────────────────
    "Dead Centre":                                      ("Tools", "Centres & Arbors"),
    "Dead center , Direct Hardened&Precision Ground":   ("Tools", "Centres & Arbors"),
    "Pipe Centre":                                      ("Tools", "Centres & Arbors"),
    "Revolving Centre":                                 ("Tools", "Centres & Arbors"),
    "Revolving Pipe Centre":                            ("Tools", "Centres & Arbors"),

    # ── TOOLS / Files & Scrapers ──────────────────────────────────────────
    "Flat File":                                        ("Tools", "Files & Scrapers"),
    "Flat File ( Bastard cut )":                        ("Tools", "Files & Scrapers"),
    "Flat File ( Smooth cut )":                         ("Tools", "Files & Scrapers"),
    "Half Round File":                                  ("Tools", "Files & Scrapers"),
    "Knife Edge File":                                  ("Tools", "Files & Scrapers"),
    "Triangle File":                                    ("Tools", "Files & Scrapers"),
    "Round File":                                       ("Tools", "Files & Scrapers"),
    "Square File":                                      ("Tools", "Files & Scrapers"),
    "Wood File":                                        ("Tools", "Files & Scrapers"),
    "Needle File":                                      ("Tools", "Files & Scrapers"),
    "Scraper":                                          ("Tools", "Files & Scrapers"),
    "Hacksaw Frame":                                    ("Tools", "Files & Scrapers"),
    "Hacksaw Blade":                                    ("Tools", "Files & Scrapers"),

    # ── TOOLS / Hammers & Punches ─────────────────────────────────────────
    "Ball Pein Hammer":                                 ("Tools", "Hammers & Punches"),
    "Cross Pein Hammer":                                ("Tools", "Hammers & Punches"),
    "Sledge Hammer":                                    ("Tools", "Hammers & Punches"),
    "Mallet Hammer":                                    ("Tools", "Hammers & Punches"),
    "Letter Punch":                                     ("Tools", "Hammers & Punches"),
    "Number Punch":                                     ("Tools", "Hammers & Punches"),
    "Drift":                                            ("Tools", "Hammers & Punches"),
    "Flat Chisel":                                      ("Tools", "Hammers & Punches"),

    # ── TOOLS / Pliers & Vices ────────────────────────────────────────────
    "Circlip Plier ( External Straight )":              ("Tools", "Pliers & Vices"),
    "Circlip Plier ( External Bent )":                  ("Tools", "Pliers & Vices"),
    "Circlip Plier ( Internal Straight )":              ("Tools", "Pliers & Vices"),
    "Circlip Plier ( Internal Bent )":                  ("Tools", "Pliers & Vices"),
    "Nose Plier":                                       ("Tools", "Pliers & Vices"),
    "Hand Vice":                                        ("Tools", "Pliers & Vices"),
    "Grinding Vice":                                    ("Tools", "Pliers & Vices"),
    "Screw Driver":                                     ("Tools", "Pliers & Vices"),
    "Screw Driver Set":                                 ("Tools", "Pliers & Vices"),

    # ── TOOLS / Surface & Inspection Plates ──────────────────────────────
    "Angle Plate":                                      ("Tools", "Surface & Inspection Plates"),
    "Cast Iron Plate":                                  ("Tools", "Surface & Inspection Plates"),
    "V - Blocks":                                       ("Tools", "Surface & Inspection Plates"),
    "V - Blocks ( Magnetic )":                          ("Tools", "Surface & Inspection Plates"),
    "V - Blocks ( Big )":                               ("Tools", "Surface & Inspection Plates"),
    "Parallel Block":                                   ("Tools", "Surface & Inspection Plates"),
    "Parallel Block (HMT )":                            ("Tools", "Surface & Inspection Plates"),
    "Bearing Puller":                                   ("Tools", "Surface & Inspection Plates"),
    "Master Cylinder":                                  ("Tools", "Surface & Inspection Plates"),
    "Edge Finder":                                      ("Tools", "Surface & Inspection Plates"),

    # ── INSTRUMENTS / Micrometers ─────────────────────────────────────────
    "Analog Outside Micrometer":                        ("Instruments", "Micrometers"),
    "Analog Outside Micrometer NEW STOCK":              ("Instruments", "Micrometers"),
    "Digital Outside Micrometer":                       ("Instruments", "Micrometers"),
    "Outside Micrometer":                               ("Instruments", "Micrometers"),
    "Depth Micrometer":                                 ("Instruments", "Micrometers"),
    "Flange Micrometer":                                ("Instruments", "Micrometers"),
    "Groove Micrometer":                                ("Instruments", "Micrometers"),
    "Pitch Micrometer":                                 ("Instruments", "Micrometers"),
    "Three Point Micrometer":                           ("Instruments", "Micrometers"),
    "Three Point Micrometer (Tri-o-Bar)":               ("Instruments", "Micrometers"),
    "Attachment blade for outside micrometer":          ("Instruments", "Micrometers"),
    "Attachable disc plate for outside micrometer":     ("Instruments", "Micrometers"),

    # ── INSTRUMENTS / Vernier Calipers ───────────────────────────────────
    "Vernier Caliper":                                  ("Instruments", "Vernier Calipers"),
    "Dial Caliper":                                     ("Instruments", "Vernier Calipers"),
    "Dial Caliper (New Stock)":                         ("Instruments", "Vernier Calipers"),
    "Digital Caliper":                                  ("Instruments", "Vernier Calipers"),
    "Digital Caliper (New Stock)":                      ("Instruments", "Vernier Calipers"),
    "DIGIMATIC FIBER CARBON CALIPER":                   ("Instruments", "Vernier Calipers"),
    "Gear Tooth Vernier Caliper":                       ("Instruments", "Vernier Calipers"),
    "Inside Caliper":                                   ("Instruments", "Vernier Calipers"),
    "Outside Caliper":                                  ("Instruments", "Vernier Calipers"),
    "Depth Vernier":                                    ("Instruments", "Vernier Calipers"),
    "Depth Scale":                                      ("Instruments", "Vernier Calipers"),

    # ── INSTRUMENTS / Dial Indicators ────────────────────────────────────
    "Plunger Dial (0.01 mm)":                           ("Instruments", "Dial Indicators"),
    "Plunger Dial (0.01 mm)(New Stock)":                ("Instruments", "Dial Indicators"),
    "Plunger Dial (Long Stylus) (0.01 mm)":             ("Instruments", "Dial Indicators"),
    "Plunger Dial (0.002 mm)":                          ("Instruments", "Dial Indicators"),
    "Plunger Dial (0.001 mm)":                          ("Instruments", "Dial Indicators"),
    "Plunger Dial (0.001 mm)(New Stock)":               ("Instruments", "Dial Indicators"),
    "Lever Type Dial (0.01 mm)":                        ("Instruments", "Dial Indicators"),
    "Lever Type Dial (0.002 mm)":                       ("Instruments", "Dial Indicators"),
    "Lever Type Dial (0.002 mm) (New Stock)":           ("Instruments", "Dial Indicators"),
    "Lever Type Dial (0.01 mm) (New Stock)":            ("Instruments", "Dial Indicators"),
    "Millimess (0.001 mm)":                             ("Instruments", "Dial Indicators"),
    "Millimess (0.001 mm)(New Stock)":                  ("Instruments", "Dial Indicators"),
    "Dial Stand":                                       ("Instruments", "Dial Indicators"),
    "Dial indicator plunger type":                      ("Instruments", "Dial Indicators"),
    "Dial  indicator plunger s shank":                  ("Instruments", "Dial Indicators"),

    # ── INSTRUMENTS / Bore Gauges ─────────────────────────────────────────
    "Bore Gauge":                                       ("Instruments", "Bore Gauges"),
    "Bore Gauge (New Stock)":                           ("Instruments", "Bore Gauges"),
    "Bore Gauge (Fixed Type)":                          ("Instruments", "Bore Gauges"),
    "Bore Gauge (Dial Included)":                       ("Instruments", "Bore Gauges"),
    "Bore Gauge (Screw Adjustment)(New Stock)":         ("Instruments", "Bore Gauges"),
    "Digital Bore Gauge":                               ("Instruments", "Bore Gauges"),
    "Bore Gauge WITH MICROMETER HEADS(New Stock)":      ("Instruments", "Bore Gauges"),
    "Bore Guage With Micrometer":                       ("Instruments", "Bore Gauges"),
    "Bore Gauge WITH MICROMETER(New Stock)":            ("Instruments", "Bore Gauges"),
    "Ring Bore Gauge (Dial Included)":                  ("Instruments", "Bore Gauges"),

    # ── INSTRUMENTS / Height Gauges ───────────────────────────────────────
    "Digital Height Gauge":                             ("Instruments", "Height Gauges"),
    "Steel Rule":                                       ("Instruments", "Height Gauges"),
    "Measuring Tape":                                   ("Instruments", "Height Gauges"),
    "L Square":                                         ("Instruments", "Height Gauges"),
    "L Square (Wedge Type)":                            ("Instruments", "Height Gauges"),
    "Radius Gauge":                                     ("Instruments", "Height Gauges"),
    "Angle Gauge":                                      ("Instruments", "Height Gauges"),
    "Square Gauge":                                     ("Instruments", "Height Gauges"),
    "Feeler Gauge":                                     ("Instruments", "Height Gauges"),
    "Force Gauge":                                      ("Instruments", "Height Gauges"),
    "Spirit Level":                                     ("Instruments", "Height Gauges"),
    "Electronic Level":                                 ("Instruments", "Height Gauges"),

    # ── INSTRUMENTS / Bevel Protractors ───────────────────────────────────
    "Bevel Protractor - 1":                             ("Instruments", "Bevel Protractors"),
    "Bevel Protractor - 2":                             ("Instruments", "Bevel Protractors"),
    "Bevel Protractor - 3":                             ("Instruments", "Bevel Protractors"),
    "Bevel Protractor - 4":                             ("Instruments", "Bevel Protractors"),
    "Optical Bevel Protractor":                         ("Instruments", "Bevel Protractors"),
    "Dividers":                                         ("Instruments", "Bevel Protractors"),

    # ── INSTRUMENTS / Plug Gauges ─────────────────────────────────────────
    "Plug Gauge ( GO and NOGO ) ( Double End )":        ("Instruments", "Plug Gauges"),
    "Plug Gauge ( GO Gauge ) (Single End)":             ("Instruments", "Plug Gauges"),
    "Plug Gauge ( NOGO Gauge ) (Single End)":           ("Instruments", "Plug Gauges"),
    "Pass-O-Meter":                                     ("Instruments", "Plug Gauges"),
    "Snap Gauge Marameter":                             ("Instruments", "Plug Gauges"),
    "Snap Gauge Marameter (New Stock)":                 ("Instruments", "Plug Gauges"),

    # ── INSTRUMENTS / Ring Gauges ─────────────────────────────────────────
    "Ring  Gauge":                                      ("Instruments", "Ring Gauges"),

    # ── INSTRUMENTS / Thread Gauges ───────────────────────────────────────
    "Thread Plug Gauge ( Go and Nogo ) ( Double End )": ("Instruments", "Thread Gauges"),
    "Thread Plug Gauge ( Go and Nogo ) ( Single End )": ("Instruments", "Thread Gauges"),
    "Thread Ring Gauge":                                ("Instruments", "Thread Gauges"),
    "Thread Pitch Gauge (Metric)":                      ("Instruments", "Thread Gauges"),
    "Thread Pitch Gauge (Inch)":                        ("Instruments", "Thread Gauges"),
    "Thread Measuring Pin's":                           ("Instruments", "Thread Gauges"),

    # ── INSTRUMENTS / Taper Gauges ────────────────────────────────────────
    "Morse Taper Gauge":                                ("Instruments", "Taper Gauges"),
    "Morse Taper Gauge ( Female )":                     ("Instruments", "Taper Gauges"),
    "Metric Taper Gauge":                               ("Instruments", "Taper Gauges"),
    "Taper Ratio Gauges":                               ("Instruments", "Taper Gauges"),
    "ISO Taper Gauges ( Male )":                        ("Instruments", "Taper Gauges"),
    "Taper Plug Gauge":                                 ("Instruments", "Taper Gauges"),

    # ── INSTRUMENTS / Slip Gauges ─────────────────────────────────────────
    "Slip Gauge Box":                                   ("Instruments", "Slip Gauges"),
    "Slip Gauge Holder":                                ("Instruments", "Slip Gauges"),
    "Gauge Block":                                      ("Instruments", "Slip Gauges"),
    "GAUGE BLOCK HOLDER 20MM OR LESS -250MM":           ("Instruments", "Slip Gauges"),
    "HALF ROUND JAW(GAUGE BLOCK HOLDER JAWS)":          ("Instruments", "Slip Gauges"),
    "Groove Comparator":                                ("Instruments", "Slip Gauges"),

    # ── INSTRUMENTS / Surface Plates & Straight Edges ────────────────────
    "Straight Edge (Knife Edge)":                       ("Instruments", "Surface Plates & Straight Edges"),
    "C I Straight Edge (Camel Back)":                   ("Instruments", "Surface Plates & Straight Edges"),
    "C I Straight Edge (Triangular)":                   ("Instruments", "Surface Plates & Straight Edges"),
    "Granite Straight Edge":                            ("Instruments", "Surface Plates & Straight Edges"),
    "Cast Iron Straight Edge":                          ("Instruments", "Surface Plates & Straight Edges"),
    "Cast Iron Straight Edge (Triangular)":             ("Instruments", "Surface Plates & Straight Edges"),
}


def resolve_category(item_description: str) -> tuple[str, str]:
    """
    Return (category, sub_category) for a given item_description.
    Tries exact match first, then case-insensitive match, then falls back to ("Tools", "General").
    """
    if not item_description:
        return ("Tools", "General")
    d = item_description.strip()
    if d in CATEGORY_MAP:
        return CATEGORY_MAP[d]
    d_lower = d.lower()
    for k, v in CATEGORY_MAP.items():
        if k.strip().lower() == d_lower:
            return v
    return ("Tools", "General")
