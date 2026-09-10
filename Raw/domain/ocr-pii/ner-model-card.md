---
license: apache-2.0
datasets:
- beki/privy
- gretelai/synthetic_pii_finance_multilingual
- eriktks/conll2003
language:
- en
base_model:
- gravitee-io/bert-small-pii-detection
pipeline_tag: token-classification
library_name: transformers.js
---



# bert-small-pii-detection (ONNX)


This is an ONNX version of [gravitee-io/bert-small-pii-detection](https://huggingface.co/gravitee-io/bert-small-pii-detection). It was automatically converted and uploaded using [this Hugging Face Space](https://huggingface.co/spaces/onnx-community/convert-to-onnx).


## Usage with Transformers.js


See the pipeline documentation for `token-classification`: https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.TokenClassificationPipeline


---


# gravitee-io/bert-small-pii-detection 🚀

**A more accurate PII detector** fine-tuned from [`prajjwal1/bert-small`](https://huggingface.co/prajjwal1/bert-small) on the datasets described in metatada. 


### About the dataset:

We combined various datasets in order to cover wide range of document formats like:  
1. JSON,
2. HTML,
3. XML,
4. SQL
5. Documents 

### Label Set

```
AGE, COORDINATE, CREDIT_CARD, DATE_TIME, EMAIL_ADDRESS, FINANCIAL, IBAN_CODE, IMEI,
IP_ADDRESS, LOCATION, MAC_ADDRESS, NRP, ORGANIZATION, PASSWORD, PERSON, PHONE_NUMBER,
TITLE, URL, US_BANK_NUMBER, US_DRIVER_LICENSE, US_ITIN, US_LICENSE_PLATE, US_PASSPORT, US_SSN
```

## How to Use

### Quick start (pipeline)

```python
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

repo = "gravitee-io/bert-small-pii-detection"
tok = AutoTokenizer.from_pretrained(repo)
model = AutoModelForTokenClassification.from_pretrained(repo)

pipe = pipeline("token-classification", model=model, tokenizer=tok, aggregation_strategy="simple")
text = ""
pipe(text)
```


## Evaluation

**Metric:** precision / recall / F1 per entity, micro/macro averages

| Entity             | Precision | Recall | F1-score | Support |
|--------------------|-----------|--------|----------|---------|
| AGE                | 0.9898    | 0.8858 | 0.9349   | 219     |
| COORDINATE         | 0.9627    | 0.8738 | 0.9161   | 325     |
| CREDIT_CARD        | 0.9273    | 0.8870 | 0.9067   | 115     |
| DATE_TIME          | 0.8598    | 0.7364 | 0.7933   | 3255    |
| EMAIL_ADDRESS      | 0.9428    | 0.8941 | 0.9178   | 387     |
| FINANCIAL          | 0.9862    | 0.9565 | 0.9711   | 299     |
| IBAN_CODE          | 0.9577    | 0.9252 | 0.9412   | 147     |
| IMEI               | 0.9885    | 0.9663 | 0.9773   | 89      |
| IP_ADDRESS         | 0.9338    | 0.8812 | 0.9068   | 160     |
| LOCATION           | 0.8849    | 0.8222 | 0.8524   | 4264    |
| MAC_ADDRESS        | 0.9889    | 1.0000 | 0.9944   | 89      |
| NRP                | 1.0000    | 0.9818 | 0.9908   | 494     |
| ORGANIZATION       | 0.7454    | 0.6688 | 0.7051   | 3551    |
| PASSWORD           | 0.8384    | 0.8137 | 0.8259   | 102     |
| PERSON             | 0.9123    | 0.8826 | 0.8972   | 4454    |
| PHONE_NUMBER       | 0.9462    | 0.8199 | 0.8785   | 322     |
| TITLE              | 0.9887    | 0.9734 | 0.9810   | 451     |
| URL                | 1.0000    | 0.9787 | 0.9892   | 188     |
| US_BANK_NUMBER     | 1.0000    | 0.9579 | 0.9785   | 95      |
| US_DRIVER_LICENSE  | 0.9167    | 0.9167 | 0.9167   | 120     |
| US_ITIN            | 0.9659    | 0.8763 | 0.9189   | 97      |
| US_LICENSE_PLATE   | 1.0000    | 0.9000 | 0.9474   | 90      |
| US_PASSPORT        | 0.9200    | 0.9200 | 0.9200   | 100     |
| US_SSN             | 0.9744    | 0.9580 | 0.9661   | 119     |
| **micro avg**      | 0.8804    | 0.8141 | 0.8460   | 19532   |
| **macro avg**      | 0.9429    | 0.8948 | 0.9178   | 19532   |
| **weighted avg**   | 0.8785    | 0.8141 | 0.8446   | 19532   |


## Intended Uses & Limitations

**Use this model for:**

* **Low resource environmens**
* Redacting PII in customer support logs, dev/test environments, API traces and articles
* Real-time hints in form fields or data entry systems

**Limitations:**

* English-focused; other languages will degrade
* Domain drift is real: audit on your own data

---

## Citation

If you use the model, please consider citing the papers:

```
@misc{bhargava2021generalization,
      title={Generalization in NLI: Ways (Not) To Go Beyond Simple Heuristics},
      author={Prajjwal Bhargava and Aleksandr Drozd and Anna Rogers},
      year={2021},
      eprint={2110.01518},
      archivePrefix={arXiv},
      primaryClass={cs.CL}
}

@article{DBLP:journals/corr/abs-1908-08962,
  author    = {Iulia Turc and
               Ming{-}Wei Chang and
               Kenton Lee and
               Kristina Toutanova},
  title     = {Well-Read Students Learn Better: The Impact of Student Initialization
               on Knowledge Distillation},
  journal   = {CoRR},
  volume    = {abs/1908.08962},
  year      = {2019},
  url       = {http://arxiv.org/abs/1908.08962},
  eprinttype = {arXiv},
  eprint    = {1908.08962},
  timestamp = {Thu, 29 Aug 2019 16:32:34 +0200},
  biburl    = {https://dblp.org/rec/journals/corr/abs-1908-08962.bib},
  bibsource = {dblp computer science bibliography, https://dblp.org}
}

@online{WinNT,
  author = {Benjamin Kilimnik},
  title = {{Privy} Synthetic PII Protocol Trace Dataset},
  year = 2022,
  url = {https://huggingface.co/datasets/beki/privy},
}

@online{gretel2023,
  author = {Gretel.ai},
  title = {{Synthetic PII Finance Multilingual Dataset}},
  year = 2023,
  url = {https://huggingface.co/datasets/gretelai/synthetic_pii_finance_multilingual},
}

@inproceedings{tjong-kim-sang-de-meulder-2003-introduction,
    title = "Introduction to the CoNLL-2003 Shared Task: Language-Independent Named Entity Recognition",
    author = "Tjong Kim Sang, Erik F. and De Meulder, Fien",
    booktitle = "Proceedings of the Seventh Conference on Natural Language Learning at HLT-NAACL 2003",
    year = "2003",
    url = "https://aclanthology.org/W03-0419",
}
}
```
