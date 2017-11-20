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
    window.RBC_DRAG_POS = drag;
  };

  handleSegmentDragEnd = () => {
    window.RBC_DRAG_POS = null;
  };

  handleBackgroundCellEnter = (date, dragItem) => {
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

    const { level: dlevel, left: dleft, span: dspan } = drag;
    const { id: did } = data;

    if (drag) {
      const nextLeft = findDayIndex(range, date) + 1;
      window.RBC_CURR_DAY = nextLeft;
      const segsInDay = ((right, left) =>
        levels.reduce((acc, lvl) => {
          return acc.concat(filter(overlaps(nextLeft, nextLeft))(lvl));
        }, []))(nextLeft, nextLeft);
      if (segsInDay.length && segsInDay.some(({ event: { id } }) => did === id)) {
        this.ignoreHoverUpdates = false;
        return;
      }

      const nextLevel = segsInDay.filter(({ left }) => left === dleft).length;
      if (type === 'outsideEvent') {
        drag.level = nextLevel;
      }

      let hover = calcPosFromDate(date, range, dspan);
      hover.level = segsInDay.length;
      const nextLevels = reorderLevels(levels, drag, { ...hover, event: drag.data });
      const { level: hlevel, right: hright } = hover;
      let _dleft = hlevel !== dlevel ? nextLeft : hright - (dspan - 1);
      window.RBC_DRAG_POS = {
        left: _dleft,
        right: _dleft + (dspan - 1),
        span: dspan,
        level: hlevel,
      };
      return this.setState({ levels: nextLevels });
    }
  };

  handleBackgroundCellHoverExit = () => {
    // TODO: figure out if needed
  };

  handleSegmentHover = (hoverItem, dragItem) => {
    if (this.ignoreHoverUpdates) return;

    const { position: hover, data: hoverData } = hoverItem;
    const { type: dragEventType, data: dragData, ...dragRest } = dragItem;
    let drag = window.RBC_DRAG_POS;
    let { events } = this.props;

    if (!drag || this._posEq(drag, hover) /* || window.RBC_CURR_DAY !== hover.left*/) return;
    const { level: dlevel, left: dleft, right: dright, span: dspan } = drag;
    const { level: hlevel, left: hleft, right: hright, span: hspan } = hover;
    const { levels } = this.state;
    const nextLevels = reorderLevels(levels, drag, hoverItem.position);

    // Since drag pos can shit horizontally as well as vertically, we need to
    // recalculate position not just swap level.
    let _dleft = hlevel !== dlevel ? dleft : hright - (dspan - 1);
    if (dleft !== hleft && !overlaps(dleft, dright)(hover)) {
      _dleft = hleft;
    }
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
    const DateContentRowWrapper = BigCalendar.components.dateContentRowWrapper;
    const props = { ...this.props, ...this.state };
    return <DateContentRowWrapper {...props}>{this.props.children}</DateContentRowWrapper>;
  }
}

export default DateContentRowWrapper;
