// Loads Runs data, potentially including histories, based on a Query (see util/query.js)

import React from 'react';
import {bindActionCreators} from 'redux';
import {connect} from 'react-redux';
import {graphql, withApollo} from 'react-apollo';
import {RUNS_QUERY} from '../graphql/runs';
import {fragments, FAKE_HISTORY_QUERY, HISTORY_QUERY} from '../graphql/runs';
import {BOARD} from '../util/board';
import {
  displayFilterKey,
  parseBuckets,
  setupKeySuggestions,
  filterRuns,
  sortRuns,
  getColumns,
} from '../util/runhelpers.js';
import withHistoryLoader from '../containers/HistoryLoader';
// TODO: read this from query
import {MAX_HISTORIES_LOADED} from '../util/constants.js';
import _ from 'lodash';

// Load the graphql data for this panel, currently loads all data for this project and entity.
function withRunsData() {
  return graphql(RUNS_QUERY, {
    skip: ({query}) =>
      !(query.strategy === 'merge' && query.entity && query.model),
    options: ({query}) => {
      const defaults = {
        variables: {
          entityName: query.entity,
          name: query.model,
          order: 'timeline',
        },
      };
      if (BOARD) defaults.pollInterval = 5000;
      return defaults;
    },
    props: ({data: {loading, model, viewer, refetch}, errors}) => {
      //TODO: For some reason the first poll causes loading to be true
      if (model && model.buckets && loading) loading = false;
      let views = null;
      if (model && model.views) {
        views = JSON.parse(model.views);
      }
      return {
        loading,
        refetch,
        buckets: model && model.buckets,
        views,
        projectID: model && model.id,
      };
    },
  });
}

// Parses buckets into runs/keySuggestions
function withDerivedRunsData(WrappedComponent) {
  let RunsDataDerived = class extends React.Component {
    constructor(props) {
      super(props);
      this.runs = [];
      this.keySuggestions = [];
    }

    _setup(props) {
      let strategy = props.query.strategy || 'page';
      if (strategy === 'page') {
        this.data = props.data;
      } else {
        this.runs = parseBuckets(props.buckets);
        this.keySuggestions = setupKeySuggestions(this.runs);
        this.filteredRuns = sortRuns(
          props.query.sort,
          filterRuns(props.query.filters, this.runs),
        );
        this.filteredRunsById = {};
        for (var run of this.filteredRuns) {
          this.filteredRunsById[run.name] = run;
        }
        this.selectedRuns = [];
        if (_.size(props.query.selections) !== 0) {
          this.selectedRuns = filterRuns(
            props.query.selections,
            this.filteredRuns,
          );
        }
        this.selectedRunsById = _.fromPairs(
          this.selectedRuns.map(run => [run.name, run.id]),
        );

        let keys = _.flatMap(
          this.keySuggestions,
          section => section.suggestions,
        );
        this.axisOptions = keys.map(key => {
          let displayKey = displayFilterKey(key);
          return {
            key: displayKey,
            value: displayKey,
            text: displayKey,
          };
        });
        this.columnNames = getColumns(this.runs);

        this.data = {
          base: this.runs,
          filtered: this.filteredRuns,
          filteredRunsById: this.filteredRunsById,
          selectedRuns: this.selectedRuns,
          selectedRunsById: this.selectedRunsById,
          keys: this.keySuggestions,
          axisOptions: this.axisOptions,
          query: this.query,
          columnNames: this.columnNames,
        };
      }
    }

    componentWillMount() {
      this._setup(this.props);
    }

    componentWillReceiveProps(nextProps) {
      if (
        this.props.buckets !== nextProps.buckets ||
        // TODO: This check won't work very well, it's probably always different
        this.props.query !== nextProps.query
      ) {
        this._setup(nextProps);
      }
    }

    render() {
      return (
        <WrappedComponent
          {...this.props}
          data={this.data}
          keySuggestions={this.keySuggestions}
          runs={this.runs}
        />
      );
    }
  };

  return RunsDataDerived;
}

function withDerivedHistoryData(WrappedComponent) {
  let HistoryDataDerived = class extends React.Component {
    constructor(props) {
      super(props);
    }

    _setup(props) {
      if (props.runHistory) {
        this.historyKeys = _.uniq(
          _.flatMap(
            _.uniq(
              _.flatMap(
                props.runHistory,
                o => (o.history ? o.history.map(row => _.keys(row)) : []),
              ),
            ),
          ),
        );
        this.runHistories = {
          loading: props.runHistory.some(o => !o.history),
          maxRuns: MAX_HISTORIES_LOADED,
          totalRuns: _.keys(props.selectedRunsById).length,
          data: props.runHistory.filter(o => o.history),
          keys: this.historyKeys,
        };
      }
    }

    componentWillMount() {
      this._setup(this.props);
    }

    componentWillReceiveProps(nextProps) {
      this._setup(nextProps);
    }

    render() {
      let data = {...this.props.data};
      if (this.props.runHistory) {
        data.histories = this.runHistories;
      }
      return (
        <WrappedComponent
          {...this.props}
          data={data}
          keySuggestions={this.keySuggestions}
          runs={this.runs}
        />
      );
    }
  };

  return HistoryDataDerived;
}

export default function withRunsDataLoader(WrappedComponent) {
  let RunsDataLoader = class extends React.Component {
    render() {
      return <WrappedComponent {...this.props} />;
    }
  };

  return withRunsData()(
    withDerivedRunsData(
      withHistoryLoader(withDerivedHistoryData(RunsDataLoader)),
    ),
  );
}