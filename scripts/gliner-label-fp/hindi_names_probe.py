"""Probe: can a drop-in model find synthetic Hindi person names in short UI text? (3 October 2026)

    python3 scripts/gliner-label-fp/hindi_names_probe.py urchade/gliner_multi_pii-v1
    python3 scripts/gliner-label-fp/hindi_names_probe.py urchade/gliner_multi-v2.1
    python3 scripts/gliner-label-fp/hindi_names_probe.py indicner    # ai4bharat/IndicNER, gated on the Hub

8 synthetic lines with a name (7 Hindi, 1 English control) and 16 Hindi UI labels with none, scored
alone (not in the DOM line format), person-name threshold 0.3. Author-written; not a benchmark.
Results: Benchmarks/results/hindi-names-probe-v01.json.
"""
import time, json, sys
POS = ["नमस्ते, प्रिया शर्मा", "खाता धारक राहुल वर्मा", "प्रेषक: अनीता देसाई", "स्वागत है अर्जुन मेहता",
       "लाभार्थी का नाम सुनीता यादव", "रमेश कुमार को भुगतान करें", "Signed in as Ananya Krishnan", "प्रिय विकास, आपका खाता तैयार है"]
NAMES = ["प्रिया शर्मा", "राहुल वर्मा", "अनीता देसाई", "अर्जुन मेहता", "सुनीता यादव", "रमेश कुमार", "Ananya Krishnan", "विकास"]
NEG = ["खाता विवरण", "मेरे खाते", "खाता हटाएं", "पासवर्ड बदलें", "जन्म तिथि", "पता बदलें", "सहायता केंद्र", "भुगतान करें",
       "दस्तावेज़ खोजें", "ग्राहक सेवा", "लॉग आउट", "भाषा चुनें", "सूचनाएं", "मेरे ऑर्डर", "सावधि जमा", "खरीदारी जारी रखें"]
which = sys.argv[1]
if which == "indicner":
    from transformers import pipeline
    t0 = time.time(); ner = pipeline("token-classification", model="ai4bharat/IndicNER", aggregation_strategy="simple"); load = time.time() - t0
    def run(t): return [(e["word"], e["entity_group"], round(float(e["score"]), 2)) for e in ner(t) if e["entity_group"] == "PER"]
else:
    from gliner import GLiNER
    t0 = time.time(); m = GLiNER.from_pretrained(which); load = time.time() - t0
    def run(t): return [(e["text"], e["label"], round(e["score"], 2)) for e in m.predict_entities(t, ["person name"], threshold=0.3)]
hit = 0; ms = []
for t, n in zip(POS, NAMES):
    s = time.perf_counter(); r = run(t); ms.append((time.perf_counter() - s) * 1000)
    ok = any(n in w or w.replace(" ", "") in n.replace(" ", "") and len(w) > 1 for w, *_ in r); hit += ok
    print("POS", "OK " if ok else "MISS", t, r)
fp = 0
for t in NEG:
    r = run(t); fp += bool(r)
    if r: print("NEG FP", t, r)
print(json.dumps({"model": which, "load_s": round(load, 1), "names_found": f"{hit}/{len(POS)}", "neg_with_person": f"{fp}/{len(NEG)}", "ms_p50": sorted(ms)[len(ms)//2]}))
