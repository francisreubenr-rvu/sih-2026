"""Remove initializer inputs from the upstream ONNX graph without changing weights.
Run with onnx==1.19.0. Keeps the original download for provenance/comparison.
"""
from pathlib import Path
import onnx
root=Path(__file__).resolve().parents[1]
original=root/'Prototype/models/ultraface-rfb320.original.onnx'
output=root/'Prototype/models/ultraface-rfb320.onnx'
if not original.exists(): original.write_bytes(output.read_bytes())
model=onnx.load(str(original))
weights={x.name for x in model.graph.initializer}
inputs=[x for x in model.graph.input if x.name not in weights]
removed=len(model.graph.input)-len(inputs)
del model.graph.input[:]
model.graph.input.extend(inputs)
used={name for node in model.graph.node for name in node.input} | {value.name for value in model.graph.output}
kept=[value for value in model.graph.initializer if value.name in used]
unused=len(model.graph.initializer)-len(kept)
del model.graph.initializer[:]
model.graph.initializer.extend(kept)
onnx.checker.check_model(model)
onnx.save(model,str(output))
print(f'Removed {removed} redundant initializer inputs; retained {len(inputs)} actual input(s). Removed {unused} unused training counters. Active weights unchanged.')
