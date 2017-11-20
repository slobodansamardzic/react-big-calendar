import findIndex from 'ramda/src/findIndex';
import propEq from 'ramda/src/propEq';
import clone from 'ramda/src/clone';
import splitAt from 'ramda/src/splitAt';
import isSameDay from 'date-fns/is_same_day';

const findSeg = (level, left) => findIndex(propEq('left', left))(level);

const overlaps = (left, right) => ({ left: l, right: r }) => r >= left && right >= l;

const calcRange = segs =>
  segs.reduce(
    (acc, { left, right }) => {
      let [a, b] = acc;
      if (!a) a = left;
      if (!b) b = right;
      if (left < a) a = left;
      if (right > b) b = right;
      return [a, b];
    },
    [0, 0],
  );

const groupOverlapping = (level, { left, right }) =>
  level.reduce(
    (acc, seg) => {
      const isOverlapping = overlaps(left, right)(seg);
      const [a, b] = acc;
      isOverlapping ? a.push(seg) : b.push(seg);
      return acc;
    },
    [[], []],
  );

const bubbleDownSeg = (levels, seg, startIdx = 0) => {
  let range = seg;
  let over = [seg];
  for (let i = startIdx, len = levels.length; i < len; i++) {
    const lvl = levels[i];
    const [overlapping, notOverlapping] = groupOverlapping(lvl, range);
    const nextLvl = [...over, ...notOverlapping];
    nextLvl.sort(segSorter);
    levels[i] = nextLvl;

    // calc next range
    const [left, right] = calcRange(overlapping);
    range = { left, right };
    over = overlapping;
  }
  if (over.length) levels.push(over);
};

const segSorter = ({ left: a }, { left: b }) => a - b;

const newPos = ({ left }, span) => ({ left, right: left + span - 1, span });

const newSeg = (seg, nextSeg, event) => ({ ...newPos(nextSeg, seg.span), event });

const reorderLevels = (levels, dragItem, hoverItem) => {
  let nextLevels = [];
  const lvls = [].concat(levels);
  const { level: dlevel, left: dleft, span: dspan } = dragItem;
  const { level: hlevel, left: hleft, right: hright, span: hspan } = hoverItem;
  const dragIdx = findSeg(lvls[dlevel], dleft);
  const hoverIdx = findSeg(lvls[hlevel], hleft);

  // levels
  const _drag = [].concat(lvls[dlevel]);
  let _hover = [].concat(lvls[hlevel]);

  // dragging from outside the cal
  if (hoverIdx === -1 && dragIdx === -1) {
    _drag.push(dragItem);
    _drag.sort(segSorter);
    lvls[dlevel] = _drag;
    return lvls.map(lvl => [].concat(lvl));
  }

  // drag
  const { event: dragData, ...dragSeg } = lvls[dlevel][dragIdx];

  // dragging to an empty cell
  if (hoverIdx === -1 /*&& dragData === hoverItem.event*/) {
    _drag.splice(dragIdx, 1);
    if (dlevel === hlevel) {
      _hover = _drag;
    }
    _hover.push({ ...hoverItem, event: dragData });
    _hover.sort(segSorter);
    (lvls[dlevel] = _drag), (lvls[hlevel] = _hover);
    return lvls.map(lvl => [].concat(lvl));
  }

  const { event: hoverData, ...hoverSeg } = lvls[hlevel][hoverIdx];

  // remove drag and hover items
  if (dlevel === hlevel) {
    _drag.splice(dragIdx, 1);
    const newHoverIdx = findSeg(_drag, hleft);
    _drag.splice(newHoverIdx, 1);
    lvls[dlevel] = [].concat(_drag);
  } else {
    _drag.splice(dragIdx, 1), _hover.splice(hoverIdx, 1);
    (lvls[dlevel] = _drag), (lvls[hlevel] = _hover);
  }

  if (dragIdx < 0 || hoverIdx < 0) {
    throw `unable to find ${dragIdx < 0 ? 'drag' : 'hover'} segment`;
  }
  // calculated overlapping
  const [overlapping, notOverlapping] = groupOverlapping(lvls[hlevel], dragSeg);
  let remainder = null;
  let processRemainder = false;
  for (let i = 0, len = lvls.length; i < len; i++) {
    let level = [].concat(lvls[i]);
    let lvlDiff = dlevel - hlevel;
    if (dlevel === i) {
      if (dleft !== hleft && hlevel === dlevel) {
        // noop
      } else if (hspan > 1) {
        const [over, notOver] = groupOverlapping(lvls[dlevel], hoverSeg);
        level = [...notOver, { ...hoverSeg, event: hoverData }];
        remainder = over.length ? over : null;
      } else if (dspan > 1) {
        level.push(...overlapping, { ...hoverSeg, event: hoverData });
      } else if (dleft !== hleft) {
        // noop
      } else if (/*dlevel < hlevel &&*/ Math.abs(lvlDiff) === 1) {
        // insert hover into current level
        level.push({ ...hoverSeg, event: hoverData });
      }
    }

    if (hlevel === i) {
      if (dspan > 1) {
        level = [...notOverlapping, { ...dragSeg, event: dragData }];
      } else if (dleft !== hleft) {
        let leftOffset = hspan !== dspan ? hright - (dspan - 1) : hleft;
        const nextSeg = newSeg(dragSeg, { left: leftOffset }, dragData);
        level.push(nextSeg);
        remainder = [{ ...hoverSeg, event: hoverData }];
      } else if (Math.abs(lvlDiff) === 1) {
        // insert drag into currect level
        /*hlevel > dlevel &&*/ level.push({ ...dragSeg, event: dragData });
      } else {
        if (dlevel < hlevel) {
          nextLevels.push([{ ...hoverSeg, event: hoverData }]);
          level.push(newSeg(dragSeg, hoverSeg, dragData));
        } else {
          nextLevels.push([{ ...dragSeg, event: dragData }]);
          level.push(newSeg(hoverSeg, dragSeg, hoverData));
        }
      }
    }

    if (level.length === 0) continue;

    if (remainder) {
      if (processRemainder) {
        const [left, right] = calcRange(remainder);
        const [over, notOver] = groupOverlapping(level, { left, right });
        level = [...notOver, ...remainder];
        //processRemainder = false;
        remainder = over.length ? over : ((processRemainder = false), null);
      } else {
        processRemainder = true;
      }
    }

    level.sort(segSorter);
    nextLevels.push(level);
  }

  if (remainder) {
    nextLevels.push(remainder);
  }

  // update level prop
  for (let i = 0, len = nextLevels.length; i < len; i++) {
    nextLevels[i] = nextLevels[i].map(seg => ({ ...seg, level: i }));
  }
  return nextLevels;
};

export { reorderLevels as default, bubbleDownSeg };
