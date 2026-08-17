export const PHYSICAL_TOY_RECONCILIATION_INSTRUCTIONS = `
The unit of analysis is ONE SELLABLE TOY OR TOY SET, not every physical object,
detachable piece, visible component, feature, detector crop, or partial view. Several
physically separate objects may constitute one sellable toy set when strong visual
or functional evidence shows they were designed to belong together and a parent
would normally list them together.

An attached or integral component belongs to its parent toy and must not become a
separate toy item. Examples include an attached fire-truck ladder or rescue basket,
crane boom, excavator arm or bucket, vehicle wheel, door, cab or bed, dinosaur tail
or leg, doll limb, attached dollhouse part, airplane wing, helicopter rotor, train
wheel, or steering wheel attached to a ride-on toy. Detachable pieces can also belong
to one sellable set: a puzzle board and its removable pieces, a shape sorter and its
shapes, a board game and its board/cards/dice/pieces, a building set and its blocks,
a train set and its trains/cars/tracks, a dollhouse and matching furniture, a toy
kitchen and matching utensils, or an RC vehicle and its matching controller. These
examples are illustrative rather than an exhaustive classification list.

Before returning the final result, perform a set-level reconciliation across all
supplied candidates. Ask whether candidates are independent toys that a parent would
reasonably list separately, or components, pieces, accessories, duplicates, or
partial views of one sellable toy or manufactured set. When strong evidence supports
one set, choose exactly one candidate as its representative. Keep that representative
as isToy true with belongsToCandidateId null. Suppress every other component with
isToy false and belongsToCandidateId pointing directly to the representative.

The representative is an internal anchor for the whole set, even when its detector
crop shows only one component and no detector candidate covers the whole set. Its
name, category, recommendation, reason, confidence, and play ideas must describe the
COMPLETE SELLABLE SET rather than the representative piece. For example, several
wooden animal pieces visibly belonging to one puzzle become one "wooden animal
puzzle", not separate animal figures. Multiple pieces may point directly to the same
representative; never create association chains.

When multiple detected candidates are clearly pieces of ONE puzzle, return one
sellable puzzle and suppress/associate its pieces. Matching slots, a shared puzzle
board, coordinated piece design, or source descriptions such as "part of a puzzle"
are strong set evidence. Apply the same principle to shape sorters, board games,
building sets, train sets, dollhouses, toy kitchens, and other manufactured sets.

Require strong semantic evidence of shared set identity. Do not merge merely because
objects are close, overlap, share colors/material/category/brand, look identical, or
could theoretically be used together. Two overlapping toys, two identical cars, two
separate puzzles, several unrelated stuffed animals, or a doll beside an unrelated
car remain separate sellable items. One set beside an unrelated toy becomes two
items. When set membership is ambiguous, preserve independent items rather than
incorrectly merging them. Continue detecting small, partial, occluded, stacked,
overlapping, or basketed toys when each is independently sellable.
`.trim();
