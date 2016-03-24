morpheus.OpenDatasetTool = function() {
	this.customUrls = [];
};

morpheus.OpenDatasetTool.fileExtensionPrompt = function(file, callback) {
	var ext = morpheus.Util.getExtension(morpheus.Util.getFileName(file));
	var deferred;
	if (ext === 'maf') {
		this._promptMaf(function(mafGeneFilter) {
			callback(mafGeneFilter);
		});
	} else if (ext === 'seg' || ext === 'segtab') {
		this._promptSegtab(function(regions) {
			callback(regions);
		});

	} else {
		callback(null);
	}

};
morpheus.OpenDatasetTool._promptMaf = function(promptCallback) {
	var formBuilder = new morpheus.FormBuilder();
	formBuilder
			.append({
				name : 'MAF_gene_symbols',
				value : '',
				type : 'textarea',
				required : true,
				help : 'Enter one gene symbol per line to filter genes. Leave blank to show all genes.'
			});
	morpheus.FormBuilder
			.showInModal({
				title : 'Gene Symbols',
				html : formBuilder.$form,
				close : 'OK',
				callback : function() {
					var text = formBuilder.getValue('MAF_gene_symbols');
					var lines = morpheus.Util.splitOnNewLine(text);
					var mafGeneFilter = new morpheus.Map();
					for (var i = 0, nlines = lines.length, counter = 0; i < nlines; i++) {
						var line = lines[i];
						if (line !== '') {
							mafGeneFilter.set(line, counter++);
						}
					}
					var readOptions = mafGeneFilter.size() > 0 ? {
						mafGeneFilter : mafGeneFilter
					} : null;
					promptCallback(readOptions);
				}
			});
};
morpheus.OpenDatasetTool._promptSegtab = function(promptCallback) {
	var formBuilder = new morpheus.FormBuilder();
	formBuilder
			.append({
				name : 'regions',
				value : '',
				type : 'textarea',
				required : true,
				help : 'Define the regions over which you want to define the CNAs. Enter one region per line. Each line should contain region_id, chromosome, start, and end separated by a tab. Leave blank to use all unique segments in the segtab file as regions.'
			});
	morpheus.FormBuilder
			.showInModal({
				title : 'Regions',
				html : formBuilder.$form,
				close : 'OK',
				callback : function() {
					var text = formBuilder.getValue('regions');
					var lines = morpheus.Util.splitOnNewLine(text);
					var regions = [];
					var tab = /\t/;
					for (var i = 0, nlines = lines.length, counter = 0; i < nlines; i++) {
						var line = lines[i];

						if (line !== '') {
							var tokens = line.split(tab);
							if (tokens.length >= 4) {
								regions.push({
									id : tokens[0],
									chromosome : tokens[1],
									start : parseInt(tokens[2]),
									end : parseInt(tokens[3])
								});
							}
						}
					}
					var readOptions = regions.length > 0 ? {
						regions : regions
					} : null;
					promptCallback(readOptions);
				}
			});
};
morpheus.OpenDatasetTool.prototype = {
	toString : function() {
		return 'Open Dataset';
	},
	_read : function(options, deferred) {
		var _this = this;
		var project = options.project;
		var controller = options.controller;
		var file = options.input.file;
		var action = options.input.open_file_action;
		var dataset = project.getSortedFilteredDataset();
		deferred.fail(function(err) {
			var message = [ 'Error opening ' + morpheus.Util.getFileName(file)
					+ '.' ];
			if (err.message) {
				message.push('<br />Cause: ');
				message.push(err.message);
			}
			morpheus.FormBuilder.showInModal({
				title : 'Error',
				html : message.join('')
			});
		});
		deferred
				.done(function(newDataset) {

					var extension = morpheus.Util.getExtension(morpheus.Util
							.getFileName(file));
					var filename = morpheus.Util.getBaseFileName(morpheus.Util
							.getFileName(file));
					if (action === 'append' || action === 'append columns') {

						// "append": append rows to current dataset
						var appendRows = action === 'append';
						// rename fields?
						_.each(controller.options.rows, function(item) {
							if (item.renameTo) {
								var v = newDataset.getRowMetadata().getByName(
										item.field);
								if (v) {
									v.setName(item.renameTo);
								}
							}
						});
						_.each(controller.options.columns, function(item) {
							if (item.renameTo) {
								var v = newDataset.getColumnMetadata()
										.getByName(item.field);
								if (v) {
									v.setName(item.renameTo);
								}
							}
						});

						if (controller.options.datasetReady) {
							controller.options.datasetReady(newDataset);
						}
						var currentDatasetMetadataNames = morpheus.MetadataUtil
								.getMetadataNames(!appendRows ? dataset
										.getRowMetadata() : dataset
										.getColumnMetadata());
						var newDatasetMetadataNames = morpheus.MetadataUtil
								.getMetadataNames(!appendRows ? newDataset
										.getRowMetadata() : newDataset
										.getColumnMetadata());

						if (currentDatasetMetadataNames.length > 1
								|| newDatasetMetadataNames.length > 1) {

							_this
									._matchAppend(
											newDatasetMetadataNames,
											currentDatasetMetadataNames,
											controller,
											function(appendOptions) {
												controller
														.getProject()
														.setFullDataset(
																appendRows ? new morpheus.JoinedDataset(
																		dataset,
																		newDataset,
																		appendOptions.current_dataset_annotation_name,
																		appendOptions.new_dataset_annotation_name)
																		: new morpheus.TransposedDatasetView(
																				new morpheus.JoinedDataset(
																						new morpheus.TransposedDatasetView(
																								dataset),
																						new morpheus.TransposedDatasetView(
																								newDataset),
																						appendOptions.current_dataset_annotation_name,
																						appendOptions.new_dataset_annotation_name)),
																true);

												if (controller.options.renderReady) {
													controller.options
															.renderReady(controller);
													controller.updateDataset();
												}
												if (appendRows) {
													controller
															.getHeatMapElementComponent()
															.getColorScheme()
															.setSeparateColorSchemeForRowMetadataField(
																	'Source');

													var sourcesSet = morpheus.VectorUtil
															.getSet(controller
																	.getProject()
																	.getFullDataset()
																	.getRowMetadata()
																	.getByName(
																			'Source'));
													sourcesSet
															.forEach(function(
																	source) {
																controller
																		.autoDisplay({
																			extension : morpheus.Util
																					.getExtension(source),
																			filename : source
																		});
															});
												}

												controller.tabManager
														.setTabTitle(
																controller.tabId,
																controller
																		.getProject()
																		.getFullDataset()
																		.getRowCount()
																		+ ' row'
																		+ morpheus.Util
																				.s(controller
																						.getProject()
																						.getFullDataset()
																						.getRowCount())
																		+ ' x '
																		+ controller
																				.getProject()
																				.getFullDataset()
																				.getColumnCount()
																		+ ' column'
																		+ morpheus.Util
																				.s(controller
																						.getProject()
																						.getFullDataset()
																						.getColumnCount()));
												controller.revalidate();
											});
						} else { // no need to prompt
							controller
									.getProject()
									.setFullDataset(
											appendRows ? new morpheus.JoinedDataset(
													dataset,
													newDataset,
													currentDatasetMetadataNames[0],
													newDatasetMetadataNames[0])
													: new morpheus.TransposedDatasetView(
															new morpheus.JoinedDataset(
																	new morpheus.TransposedDatasetView(
																			dataset),
																	new morpheus.TransposedDatasetView(
																			newDataset),
																	currentDatasetMetadataNames[0],
																	newDatasetMetadataNames[0])),
											true);
							if (controller.options.renderReady) {
								controller.options.renderReady(controller);
								controller.updateDataset();
							}
							if (appendRows) {
								controller
										.getHeatMapElementComponent()
										.getColorScheme()
										.setSeparateColorSchemeForRowMetadataField(
												'Source');
								var sourcesSet = morpheus.VectorUtil
										.getSet(controller.getProject()
												.getFullDataset()
												.getRowMetadata().getByName(
														'Source'));
								sourcesSet.forEach(function(source) {
									controller.autoDisplay({
										extension : morpheus.Util
												.getExtension(source),
										filename : source
									});
								});
							}
							controller.tabManager.setTabTitle(controller.tabId,
									controller.getProject().getFullDataset()
											.getRowCount()
											+ ' row'
											+ morpheus.Util.s(controller
													.getProject()
													.getFullDataset()
													.getRowCount())
											+ ' x '
											+ controller.getProject()
													.getFullDataset()
													.getColumnCount()
											+ ' column'
											+ morpheus.Util.s(controller
													.getProject()
													.getFullDataset()
													.getColumnCount()));
							controller.revalidate();
						}

					} else if (action === 'overlay') {

						_this
								._matchOverlay(
										morpheus.MetadataUtil
												.getMetadataNames(newDataset
														.getColumnMetadata()),
										morpheus.MetadataUtil
												.getMetadataNames(dataset
														.getColumnMetadata()),
										morpheus.MetadataUtil
												.getMetadataNames(newDataset
														.getRowMetadata()),
										morpheus.MetadataUtil
												.getMetadataNames(dataset
														.getRowMetadata()),
										controller,
										function(appendOptions) {
											var rowValueToIndexMap = morpheus.VectorUtil
													.createValueToIndexMap(dataset
															.getRowMetadata()
															.getByName(
																	appendOptions.current_dataset_row_annotation_name));
											var columnValueToIndexMap = morpheus.VectorUtil
													.createValueToIndexMap(dataset
															.getColumnMetadata()
															.getByName(
																	appendOptions.current_dataset_column_annotation_name));
											var seriesIndex = dataset
													.addSeries({
														name : newDataset
																.getName(),
														dataType : 'object'
													});

											var rowVector = newDataset
													.getRowMetadata()
													.getByName(
															appendOptions.new_dataset_row_annotation_name);
											var rowIndices = [];
											var newDatasetRowIndicesSubset = [];
											for (var i = 0, size = rowVector
													.size(); i < size; i++) {
												var index = rowValueToIndexMap
														.get(rowVector
																.getValue(i));
												if (index !== undefined) {
													rowIndices.push(index);
													newDatasetRowIndicesSubset
															.push(i);
												}
											}

											var columnVector = newDataset
													.getColumnMetadata()
													.getByName(
															appendOptions.new_dataset_column_annotation_name);
											var columnIndices = [];
											var newDatasetColumnIndicesSubset = [];
											for (var i = 0, size = columnVector
													.size(); i < size; i++) {
												var index = columnValueToIndexMap
														.get(columnVector
																.getValue(i));
												if (index !== undefined) {
													columnIndices.push(index);
													newDatasetColumnIndicesSubset
															.push(i);
												}
											}
											newDataset = new morpheus.SlicedDatasetView(
													newDataset,
													newDatasetRowIndicesSubset,
													newDatasetColumnIndicesSubset);
											for (var i = 0, nrows = newDataset
													.getRowCount(); i < nrows; i++) {
												for (var j = 0, ncols = newDataset
														.getColumnCount(); j < ncols; j++) {
													dataset.setValue(
															rowIndices[i],
															columnIndices[j],
															newDataset
																	.getValue(
																			i,
																			j),
															seriesIndex);

												}
											}

										});
					} else if (action === 'open') { // new tab
						new morpheus.HeatMap({
							dataset : newDataset,
							parent : controller,
							inheritFromParent : false
						});

					} else {
						console.log('Unknown action: ' + action);
					}

					controller.revalidate();
				});
	},
	execute : function(options) {
		var file = options.input.file;
		var _this = this;
		morpheus.OpenDatasetTool
				.fileExtensionPrompt(file,
						function(readOptions) {
							var deferred = morpheus.DatasetUtil.read(file,
									readOptions);
							_this._read(options, deferred);
						});

	}, // prompt for metadata field name in dataset and in file
	_matchAppend : function(newDatasetMetadataNames,
			currentDatasetMetadataNames, controller, callback) {
		var tool = {};
		tool.execute = function(options) {
			return options.input;
		};
		tool.toString = function() {
			return 'Select Fields';
		};
		tool.gui = function() {
			var items = [ {
				name : 'current_dataset_annotation_name',
				options : currentDatasetMetadataNames,
				type : 'select',
				required : true
			} ];
			items.push({
				name : 'new_dataset_annotation_name',
				type : 'select',
				options : newDatasetMetadataNames,
				required : true
			});
			return items;
		};
		morpheus.HeatMap.showTool(tool, controller, callback);
	},
	_matchOverlay : function(newDatasetColumnMetadataNames,
			currentDatasetColumnMetadataNames, newDatasetRowMetadataNames,
			currentDatasetRowMetadataNames, controller, callback) {
		var tool = {};
		tool.execute = function(options) {
			return options.input;
		};
		tool.toString = function() {
			return 'Select Fields';
		};
		tool.gui = function() {
			var items = [];
			items.push({
				name : 'current_dataset_column_annotation_name',
				options : currentDatasetColumnMetadataNames,
				type : 'select',
				required : true
			});
			items.push({
				name : 'new_dataset_column_annotation_name',
				type : 'select',
				options : newDatasetColumnMetadataNames,
				required : true
			});
			items.push({
				name : 'current_dataset_row_annotation_name',
				options : currentDatasetRowMetadataNames,
				type : 'select',
				required : true
			});
			items.push({
				name : 'new_dataset_row_annotation_name',
				type : 'select',
				options : newDatasetRowMetadataNames,
				required : true
			});
			return items;
		};
		morpheus.HeatMap.showTool(tool, controller, callback);
	}
};