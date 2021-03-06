var path = require('path');
var fs = require('fs');
var Promise = require('bluebird');

var _ = require('lodash');
var moment = require('moment-timezone');
var uuid = require('uuid');

var DEFAULTS = {
  filename: 'event'
};

function ICS(options) {
  this.events = [];
  this.options = _.merge({}, DEFAULTS, options);
}

function generateUID() {
  return 'UID:' + uuid.v1();
}

function setFileExtension(dest) {
  return dest.slice(-4) === '.ics' ? dest : dest.concat('.ics');
}

// Follow ISO 8601 string rules:
// If `start` contains an uppercase T or a space,
// it's a date-time; otherwise, it's just a date.
function formatDTSTART(string, tz) {

  if (!string) {
    return 'DTSTART:' + moment().format('YYYYMMDD');
  }

  if (tz) {
    return 'DTSTART;TZID=' + tz + ':' + moment(string).format('YYYYMMDDTHHmm00');
  }

  if (isDateTime(string) && moment.parseZone(string).utcOffset() === 0) {
    return 'DTSTART:' + moment(string).format('YYYYMMDDTHHmm00');
  }

  if (isDateTime(string)) {
    return moment(string).format('YYYYMMDDTHHmm00') + 'Z';
  }

  return 'DTSTART;VALUE=DATE:' + moment(string).format('YYYYMMDD');
}

function formatDTEND(startString, endString, tz, tzEnd) {

  if (!startString) {
    return 'DTEND:' + moment().add(1, 'days').format('YYYYMMDD');
  }

  if (tz && !tzEnd && !endString) {
    return 'DTEND;TZID=' + tz + ':' + moment(startString).format('YYYYMMDDTHHmm00');
  }

  if (tz && !tzEnd && endString) {
    return 'DTEND;TZID=' + tz + ':' + moment(endString).format('YYYYMMDDTHHmm00');
  }

  if (tz && tzEnd && endString) {
    return 'DTEND;TZID=' + tzEnd + ':' + moment(endString).format('YYYYMMDDTHHmm00');
  }

  if (endString && !isDateTime(startString)) {
    return 'DTEND;VALUE=DATE:' + moment(endString).format('YYYYMMDD');
  }

  if (endString && isDateTime(startString)) {
    return 'DTEND:' + moment(endString).format('YYYYMMDDTHHmm00');
  }

  if (!endString && !isDateTime(startString)) {
    return 'DTEND;VALUE=DATE:' + moment(startString).add(1, 'days').format('YYYYMMDD');
  }

  if (!endString && isDateTime(startString) && moment.parseZone(startString).utcOffset() === 0) {
    return 'DTEND:' + moment(startString).format('YYYYMMDDTHHmm00');
  }
}

function isDateTime(string) {
  return ['T', ' '].some(function (char) {
    return string.search(char) !== -1;
  });
}

function generateDateTimeStamp() {
  return moment().utc().format('YYYYMMDDTHHmmss') + 'Z';
}

function formatProperty(key, value) {
  if (value) {
    return key + ':' + value;
  }

  return null;
}

function formatAttachments(attributes) {
  if (attributes.attachments) {
    return attributes.attachments.map(function (path) {
      return 'ATTACH:' + path;
    });
  }
  return null;
}

function formatAttendees(attributes) {
  if (attributes.attendees) {
    return attributes.attendees.map(function (attendee) {
      if (attendee.name && attendee.email) {
        return 'ATTENDEE;CN=' + attendee.name + ':mailto:' + attendee.email;
      }
      return null;
    });
  }

  return null;
}

function formatCategories(attributes) {
  if (attributes.categories) {
    return 'CATEGORIES:' + attributes.categories.join(',');
  }

  return null;
}

function formatGeo(geo) {
  if (geo && geo.lat && geo.lon) {
    return 'GEO:' + parseFloat(geo.lat) + ';' + parseFloat(geo.lon);
  }

  return null;
}

function formatStatus(status) {
  if (status && ['TENTATIVE', 'CONFIRMED', 'CANCELLED'].indexOf(status.toUpperCase()) !== -1) {
    return 'STATUS:' + status;
  }

  return null;
}

function defineTimeZone(timeZone = 'America/New_York') {
  // probs make this a switch statement...
  switch (timeZone) {
    case 'America/New_York':
      return [
        'BEGIN:VTIMEZONE',
        'TZID:America/New_York',
        'BEGIN:STANDARD',
        'DTSTART:20071104T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
        'TZOFFSETFROM:-0400',
        'TZOFFSETTO:-0500',
        'TZNAME:EST',
        'END:STANDARD',
        'BEGIN:DAYLIGHT',
        'DTSTART:20070311T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
        'TZOFFSETFROM:-0500',
        'TZOFFSETTO:-0400',
        'TZNAME:EDT',
        'END:DAYLIGHT',
        'END:VTIMEZONE'
      ];
      break;
    // case 'Ameria/Chicago':
    default:
      return null;
  }
}


ICS.prototype.addEvent = function (attributes) {
  this.events.push(buildEvent(attributes));
};

ICS.prototype.empty = function () {
  this.events = [];
};

ICS.prototype.toString = function (timeZone) {
  return _.compact([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'PRODID:-//Adam Gibbons//agibbons.com//ICS: iCalendar Generator'
  ].concat(defineTimeZone()).concat(this.events).concat(['END:VCALENDAR'])).join('\r\n');
};

ICS.prototype.getDestination = function (_filepath_) {
  var filepath = _filepath_ || this.options.filename + '.ics';
  var fileObj = path.parse(filepath);
  var result = path.resolve(process.cwd(), fileObj.dir, fileObj.name + '.ics');

  return result;
};

ICS.prototype.toFile = function (filepath) {
  var content = this.toString(), destination = this.getDestination(filepath);
  return new Promise((resolve, reject) => {
    fs.writeFile(destination, content, function (err, data) {
      if (err) return reject(err);
      return resolve({ content, destination });
    });
  });
};

function buildEvent(attributes) {
  if (!attributes || _.isEmpty(attributes)) {
    return '';
  }
  return [
    'BEGIN:VEVENT',
    generateUID(),
    'DTSTAMP:' + generateDateTimeStamp(),
    formatDTSTART(attributes.start, attributes.timeZone),
    formatDTEND(attributes.start, attributes.end, attributes.timeZone, attributes.timeZoneEnd),
    formatProperty('SUMMARY', attributes.title),
    formatProperty('DESCRIPTION', attributes.description),
    formatProperty('LOCATION', attributes.location),
    formatProperty('URL', attributes.url),
    formatStatus(attributes.status),
    formatGeo(attributes.geo),
    formatAttendees(attributes),
    formatCategories(attributes),
    formatAttachments(attributes),
    'END:VEVENT'
  ].filter(item => !!item).join('\r\n');
}

module.exports = ICS;