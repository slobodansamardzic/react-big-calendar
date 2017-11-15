import PropTypes from 'prop-types';
import React, { Component } from 'react';

import propEq from 'ramda/src/propEq';
import findIndex from 'ramda/src/findIndex';
import splitAt from 'ramda/src/splitAt';
import addDays from 'date-fns/add_days';

import BigCalendar from '../../index';
import { withLevels } from '../../utils/eventLevels';
import reorderLevels from './eventLevels';

class DateContentRowWrapper extends Component {
  constructor(props) {
    super(props);
    this.state = {
      drag: null,
      hover: null,
    };

    this.hasExitedBackgroundCell = false;
    this.ignoreHoverUpdates = false;
    this.nextHover = null;
  }

  state = {
    drag: null,
    hover: null,
    hoverData: null,
  };

  static contextTypes = {
    onEventReorder: PropTypes.func,
  };

  static childContextTypes = {
    onSegmentDrag: PropTypes.func,
    onSegmentHover: PropTypes.func,
    onSegmentDrop: PropTypes.func,
    onBackgroundCellEnter: PropTypes.func,
    onBackgroundCellHoverExit: PropTypes.func,
  };

  getChildContext() {
    return {
      onSegmentDrag: this.handleSegmentDrag,
      onSegmentHover: this.handleSegmentHover,
      onSegmentDrop: this.handleSegmentDrop,
      onBackgroundCellEnter: this.handleBackgroundCellEnter,
      onBackgroundCellHoverExit: this.handleBackgroundCellHoverExit,
    };
  }

  componentWillMount() {
    const props = withLevels(this.props);
    this.setState({ ...props });
  }

  componentWillReceiveProps(props, _) {
    const next = withLevels(props);
    this.setState({ ...next });
  }

  componentWillUpdate() {
    this.ignoreHoverUpdates = true;
  }

  componentDidUpdate() {
    this.ignoreHoverUpdates = false;
  }

  _posEq = (a, b) => a.left === b.left && a.level === b.level;

  handleSegmentDrag = drag => {
    // TODO: remove and create a CalendarWrapper and set the current drag pos
    // there and also pass it to children via context
    window.RBC_DRAG_POS = drag;
  };

  handleBackgroundCellEnter = value => {};

  handleBackgroundCellHoverExit = () => {
    const props = withLevels(this.props);
    this.hasExitedBackgroundCell = true;
  };

  handleSegmentHover = (hoverItem, dragItem) => {
    if (this.ignoreHoverUpdates) return;

    const { position: hover, data: hoverData } = hoverItem;
    const { type: dragEventType, data: dragData, ...dragRest } = dragItem;
    const { insertedOutsideEvent } = this.state;
    let drag = window.RBC_DRAG_POS;
    let { events } = this.props;

    if (!insertedOutsideEvent && dragEventType === 'outsideEvent') {
      // update position based on hover
      const { position: { span } } = dragRest;
      const dragPos = { ...hover, span, level: hover.level + 1 };
      const { id: eventTemplateId, eventTemplateId: id, ...dragDataRest } = dragData;

      // calculate start and end
      const newId = cuid();
      const data = {
        ...dragDataRest,
        id: newId,
        key: newId,
        eventTemplateId,
        locked: false,
        start: hoverData.start,
        end: addDays(hoverData.start, span),
        weight: hoverData.weight - 0.5,
      };

      // update events
      events = [...events, data];

      // sort events
      events.sort(({ weight: a }, { weight: b }) => (a < b ? -1 : 1));

      // recalculate levels
      const levels = withLevels({ ...this.props, events });

      // update drag level
      let nextDragData = null;
      const lvls = levels.levels;
      for (let i = 0, len = lvls.length; i < len; i++) {
        const lvl = lvls[i];
        nextDragData = lvl.find(({ event, ...pos }) => event === data);
        if (nextDragData) break;
      }

      dragPos.level = nextDragData.level;
      window.RBC_DRAG_POS = dragPos;
      return this.setState(prev => ({
        ...levels,
        insertedOutsideEvent: true,
      }));
    }

    /*if (drag && this.hasExitedBackgroundCell) {
      drag.level = hover.level + 1;
      window.RBC_DRAG_POS = drag;
      this.hasExitedBackgroundCell = false;
      return;
    }*/

    if (this._posEq(drag, hover)) return;
    if (this.nextHover && !this._posEq(hover, this.nextHover)) return;

    this.nextHover = null;
    const { level: dlevel, left: dleft, right: dright, span: dspan } = drag;
    const { level: hlevel, left: hleft, right: hright, span: hspan } = hover;
    const { levels } = this.state;
    //console.log(drag, hover);
    //console.log('start levels', [].concat(levels));
    // flatten out segments in a single day cell
    /*const overlappingSeg = ({ left, right }) => {
      return right >= dleft && dright >= left;
    };
    let cellSegs = levels.map(segs => {
      const idx = findIndex(overlappingSeg)(segs);
      if (idx === -1) {
        return { idx };
      }

      const seg = segs[idx];
      return { ...seg, idx, isHidden: false };
    });

    let { idx: didx, ...dseg } = cellSegs[dlevel],
      { idx: hidx, ...hseg } = cellSegs[hlevel];

    // swap events
    dseg.isHidden = true;
    cellSegs[dlevel] = { idx: didx, ...hseg };
    cellSegs[hlevel] = { idx: hidx, ...dseg, level: hlevel };

    // update cell segments
    let nextLevels = [];

    // get overlapping and not overlapping segments ahead of time
    const level = dspan > 1 ? hlevel : dlevel;
    const [overlapping, notOverlapping] = levels[level].reduce(
      (acc, seg) => {
        const isOverlapping = overlappingSeg(seg);
        const [a, b] = acc;
        isOverlapping ? a.push(seg) : b.push(seg);
        return acc;
      },
      [[], []],
    );

    console.log(overlapping, notOverlapping, cellSegs);

    cellSegs.forEach(({ idx, ...seg }, i) => {
      if (idx === -1) {
        nextLevels.push(levels[i]);
        return;
      }

      console.log('inside', i);

      let lvl = levels[i];
      seg.level = i;
      if (dspan > 1 && dlevel === i) {
        lvl.splice(idx, 1);
        const nextLvl = [...overlapping, ...lvl];
        nextLevels.push(nextLvl);
      } else if (dspan > 1 && hlevel === i) {
        //const [head, [_, ...tail]] = splitAt(hidx, lvl);
        const nextLvl = [seg, ...notOverlapping].map(seg => ({ ...seg, level: i }));
        nextLevels.push(nextLvl);
      } else if (hspan > 1 && dlevel === i) {
        const dlvl = levels[dlevel];
        const [head, [_, ...tail]] = splitAt(didx, dlvl);
        nextLevels.push([{ ...seg, level: i }]);
        const nextlvl = [...head, ...tail];
        if (nextlvl.length) nextLevels.push(nextlvl.map(seg => ({ ...seg, level: i })));
        //nextLevels.push([seg]);
        //nextLevels.push(lvl);
        //lvl.splice(idx, 1);
        //const nextLvl = [...overlapping, ...lvl];
        console.log('d lvl', [].concat(nextLevels));
      } else if (hspan > 1 && hlevel === i) {

        //lvl.splice(idx, 1);
        //const nextLvl = [seg, ...notOverlapping];
        //nextLevels.push(nextLvl);
        const [head, [_, ...tail]] = splitAt(hidx, lvl);
        const nextLvl = [...head, seg, ...tail].map(seg => ({ ...seg, level: i }));


        if (seg.event === dragData) console.log('level', i, 'data is the same');
        nextLevels.push(nextLvl);
        window.breakNextRender = true;
      } else {
        lvl[idx] = seg;
        nextLevels.push(lvl);
      }
    });*/
    const nextLevels = reorderLevels(levels, drag, hoverItem.position);

    // Since drag pos can shit horizontally as well as vertically, we need to
    // recalculate position not just swap level.
    const _dleft = hleft === dleft ? dleft : hright - (dspan - 1);
    window.RBC_DRAG_POS = {
      left: _dleft,
      right: _dleft + (dspan - 1),
      span: dspan,
      level: hlevel,
    };

    this.setState({ levels: nextLevels, hover: { ...drag, level: hlevel }, hoverData });
  };

  handleSegmentDrop = ({ level, left, right }) => {
    const { levels, hoverData } = this.state;
    const { onEventReorder } = this.context;
    const drag = window.RBC_DRAG_POS;

    if (!hoverData) return;

    const dragSeg = levels[drag.level].find(({ left }) => drag.left === left);
    if (!dragSeg) {
      this.setState({ drag: null, hover: null, hoverData: null });
      return;
    }

    const dragData = dragSeg.event;
    const events = levels.reduce((acc, row) => {
      const seg = row.find(({ left }) => drag.left === left);
      if (seg) acc.push(seg.event);
      return acc;
    }, []);

    // return draggedData, hoverData, idxa, idxb, segments
    onEventReorder && onEventReorder(dragData, hoverData, drag.level, level, events);
    window.RBC_DRAG_POS = null;
    this.setState({ hover: null, hoverData: null });
  };

  render() {
    const DateContentRowWrapper = BigCalendar.components.dateContentRowWrapper;
    const props = { ...this.props, ...this.state };
    return <DateContentRowWrapper {...props}>{this.props.children}</DateContentRowWrapper>;
  }

  _withOverlapingSeg(left, right) {
    return ({ left: l, right: r }) => r >= left && right >= l;
  }
}

export default DateContentRowWrapper;
