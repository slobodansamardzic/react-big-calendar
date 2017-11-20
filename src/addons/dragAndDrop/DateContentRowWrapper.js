import PropTypes from 'prop-types';
import React, { Component } from 'react';

import propEq from 'ramda/src/propEq';
import findIndex from 'ramda/src/findIndex';
import splitAt from 'ramda/src/splitAt';
import path from 'ramda/src/path';
import filter from 'ramda/src/filter';
import addDays from 'date-fns/add_days';
import isSameDay from 'date-fns/is_same_day';

import BigCalendar from '../../index';
import { withLevels } from '../../utils/eventLevels';
import reorderLevels from './eventLevels';

const findDayIndex = (range, date) => findIndex(val => isSameDay(date, val))(range);

const calcPosFromDate = (date, range, span) => {
  const idx = findDayIndex(range, date);
  return { left: idx + 1, right: idx + span, span, level: 0 };
};

const overlaps = (left, right) => ({ left: l, right: r }) => r >= left && right >= l;

class DateContentRowWrapper extends Component {
  constructor(props) {
    super(props);
    this.state = {
      drag: null,
      hover: null,
    };

    this.ignoreHoverUpdates = false;
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
    onSegmentDragEnd: PropTypes.func,
    onSegmentHover: PropTypes.func,
    onSegmentDrop: PropTypes.func,
    onBackgroundCellEnter: PropTypes.func,
    onBackgroundCellHoverExit: PropTypes.func,
  };

  getChildContext() {
    return {
      onSegmentDrag: this.handleSegmentDrag,
      onSegmentDragEnd: this.handleSegmentDragEnd,
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
    console.log('on drag', drag);
    window.RBC_DRAG_POS = drag;
  };

  handleSegmentDragEnd = () => {
    window.RBC_DRAG_POS = null;
  };

  handleBackgroundCellEnter = (date, dragItem) => {
    console.log('cell enter', date);
    this.ignoreHoverUpdates = true;

    const { range } = this.props;
    const { levels } = this.state;
    const { type, data, position } = dragItem;
    let drag = window.RBC_DRAG_POS;
    if (!drag && type === 'outsideEvent') {
      const { id: eventTemplateId, eventTemplateId: id, ...dragDataRest } = data;

      // calculate start and end
      const newId = cuid();
      const event = {
        ...dragDataRest,
        id: newId,
        key: newId,
        eventTemplateId,
        locked: false,
        start: date,
        end: addDays(date, position.span - 1),
      };
      drag = {
        ...calcPosFromDate(date, range, position.span),
        event,
      };
    }
    //console.log('[0', drag);
    const { level: dlevel, left: dleft, span: dspan } = drag;

    const { id: did } = data;

    if (drag) {
      /*if (type === 'outsideEvent') {
        const idx = findIndex(date => isSameDay(date, date))(range);
        if (idx + 1 === drag.left) return;
        window.RBC_DRAG_POS = null;
        // return;
      }*/

      const nextLeft = findDayIndex(range, date) + 1;
      const segsInDay = ((right, left) =>
        levels.reduce((acc, lvl) => {
          return acc.concat(filter(overlaps(nextLeft, nextLeft))(lvl));
        }, []))(nextLeft, nextLeft);
      //console.log('[1', nextLeft, segsInDay);
      if (segsInDay.length && segsInDay.some(({ event: { id } }) => did === id)) {
        this.ignoreHoverUpdates = false;
        return;
      }

      if (type === 'outsideEvent') {
        drag.level = segsInDay.length;
      }

      let hover = calcPosFromDate(date, range, dspan);
      hover.level = segsInDay.length;
      console.log('day does not contains seg', did);
      const nextLevels = reorderLevels(levels, drag, { ...hover, event: data });
      console.log('next lvls', [].concat(nextLevels));
      const { level: hlevel, right: hright } = hover;
      const _dleft = hlevel !== dlevel ? nextLeft : hright - (dspan - 1);
      window.RBC_DRAG_POS = {
        left: _dleft,
        right: _dleft + (dspan - 1),
        span: dspan,
        level: hlevel,
      };
      return this.setState({ levels: nextLevels }, () => {
        //this.ignoreHoverUpdates = false;
      });

      // else if (!levels.some(lvl => (lvl.some(({ left }) => (dleft === left))))) {
      // There are not segments in this day cell

      // We can't know for certain, at this level, if we are hovering over a
      // segment. We know we have entered a day cell, but the day cell can
      // be empty or contain events. However, we may be hovering below or
      // above the events.

      //if (levels.some(cb)) {
      // TODO: create a 200ms callback to see if hover has been called
      // if not then go ahead and insert the segment.
      //  console.log('inside todo');
      //  return;
      //} else {

      //}
      // check if props.levels contains segments in the current day cell
      // TODO: work on this next
      // }
    }

    /*const drag = window.RBC_DRAG_POS;
    if (!drag) return;

    const { level, span, left } = drag;
    const { range, levels } = this.props;
    const idx = findIndex((date) => isSameDay(value, date))(range);
    if (idx < 0 || idx === left-1) return;

    const hover = {
      left: idx+1,
      right: idx + span,
      span,
      level,
    };*/
    console.log('[0');
    //const nextLevels = reorderLevels(levels, drag, hover);
    const [nextDragPos, nextLevels] = this._insertEvent(date, dragItem);

    window.RBC_DRAG_POS = nextDragPos;
    this.ignoreHoverUpdates = false;
    this.setState({ ...nextLevels });
  };

  handleBackgroundCellHoverExit = () => {
    console.log('cell exit');
    /*const drag = window.RBC_DRAG_POS;
    console.log('exit', drag, rest, drest);
    if (!drag) return;
    console.log('cell exit');
    // Inspect currect drag segment and verify we can simply null it
    const { level, left } = drag;
    const { levels } = this.state;
    const { event: { id: eventId }} = levels[level].find(({ left: v }) => (v === left));
    console.log('exit t', levels[level], eventId, id);
    if (eventId === id) {
      //window.RBC_DRAG_POS = null;
      return;
    }*/

    //window.RBC_DRAG_POS = null;
  };

  _insertEvent = (date, dragItem) => {
    const { type: dragEventType, position: drag, data: dragData } = dragItem;
    let { events, range } = this.props;

    // calc hover pos
    const { span } = drag;
    const idx = findIndex(val => isSameDay(date, val))(range);
    const hover = { left: idx + 1, right: idx + span, span, level: 0 };

    //if (dragEventType === 'outsideEvent') {
    // update position based on hover
    const dragPos = { ...hover, span, level: 0 };
    const { id: eventTemplateId, eventTemplateId: id, ...dragDataRest } = dragData;

    // calculate start and end
    const newId = cuid();
    const data = {
      ...dragDataRest,
      id: newId,
      key: newId,
      eventTemplateId,
      locked: false,
      start: date,
      end: addDays(date, span - 1),
      weight: 1,
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
    return [dragPos, levels];
    //}
    //return [];
  };

  handleSegmentHover = (hoverItem, dragItem) => {
    if (this.ignoreHoverUpdates) return;

    const { position: hover, data: hoverData } = hoverItem;
    const { type: dragEventType, data: dragData, ...dragRest } = dragItem;
    let drag = window.RBC_DRAG_POS;
    let { events } = this.props;

    if (!drag && dragEventType === 'outsideEvent') {
      // update position based on hover
      const { position: { span } } = dragRest;
      const dragPos = { ...hover, span, level: 0 };
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
        end: addDays(hoverData.start, span - 1),
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
      return this.setState(prev => ({ ...levels }));
    }

    if (!drag || this._posEq(drag, hover)) return;
    console.log('hover', drag, hover);
    const { level: dlevel, left: dleft, right: dright, span: dspan } = drag;
    const { level: hlevel, left: hleft, right: hright, span: hspan } = hover;
    const { levels } = this.state;
    const nextLevels = reorderLevels(levels, drag, hoverItem.position);

    // Since drag pos can shit horizontally as well as vertically, we need to
    // recalculate position not just swap level.
    const _dleft = hlevel !== dlevel ? dleft : hright - (dspan - 1);
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
    const events = levels.reduce(
      (acc, row) => row.reduce((acc, { event }) => (acc.push(event), acc), acc),
      [],
    );
    // return draggedData, hoverData, idxa, idxb, segments
    onEventReorder && onEventReorder(dragData, hoverData, drag.level, level, events);
    window.RBC_DRAG_POS = null;
    this.setState({ hover: null, hoverData: null });
  };

  render() {
    console.log('render');
    //setTimeout(()=>(this.ignoreHoverUpdates = false), 100);
    const DateContentRowWrapper = BigCalendar.components.dateContentRowWrapper;
    const props = { ...this.props, ...this.state };
    return <DateContentRowWrapper {...props}>{this.props.children}</DateContentRowWrapper>;
  }
}

export default DateContentRowWrapper;
