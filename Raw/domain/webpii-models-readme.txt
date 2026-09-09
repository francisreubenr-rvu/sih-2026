# WebPII Models

Trained baseline models for WebPII: A Synthetic Benchmark for Visual PII Detection in E-commerce Web Interfaces.

## Available Models

### WebRedact
- **Resolution**: 640×640
- **Performance**: 0.753 mAP@50 on Test_Cross-Company
- **Latency**: ~20ms (CPU, real-time at 30 FPS)
- **Files**: `nano640.bin`, `nano640.xml`

### WebRedact-large
- **Resolution**: 1280×1280
- **Performance**: 0.842 mAP@50 on Test_Cross-Company
- **Latency**: ~312ms (CPU, near-real-time at 3 FPS)
- **Files**: `small1280.bin`, `small1280.xml`

## Model Format

Models are provided in [OpenVINO Intermediate Representation (IR)](https://docs.openvino.ai/2024/openvino-workflow/model-preparation.html) format for CPU inference. Load using [OpenVINO Runtime](https://docs.openvino.ai/2024/openvino-workflow/running-inference.html) for inference on images.

## Classes

Both models detect two classes:
- **text**: Text-based PII elements
- **image**: Product images and visual identifiers

## Citation

```bibtex
@misc{anonymous2026webpii,
  title={WebPII: Benchmarking Visual PII Detection for Computer-Use Agents},
  author={Anonymous Authors},
  year={2026}
}
```
